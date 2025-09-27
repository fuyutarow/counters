/**
 * Seal Shard Integration with Seal Key Servers
 *
 * This module provides integration between Sui Move contracts and Seal Key Servers
 * for the new Seal Shard architecture that stores public keys directly.
 */

import { SealClient, SessionKey } from "@mysten/seal";
import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { type Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { bls12_381 } from "@noble/curves/bls12-381.js";
import { counterPackage } from "@/abi";

const blss = bls12_381.shortSignatures;

interface SealShardKeyShare {
  serverIndex: number;
  serverId: string;
  secretKey: Uint8Array;
  publicKey: Uint8Array; // G2 public key bytes
}

interface KeyServerV1Fields {
  key_type: number;
  name: string;
  pk: number[];
  url: string;
}

interface KeyServerDynamicFieldContent {
  fields: {
    id: { id: string };
    name: string;
    value: {
      type: string;
      fields: KeyServerV1Fields;
    };
  };
}

export class SealShardAggregator {
  private suiClient: SuiClient;
  private sealClient: SealClient;

  constructor(network: "mainnet" | "testnet" = "testnet") {
    this.suiClient = new SuiClient({ url: getFullnodeUrl(network) });
    this.sealClient = new SealClient({
      suiClient: this.suiClient,
      serverConfigs: [], // Empty for now, will be configured when needed
    });
  }

  /**
   * Fetch secret key shares from Seal Key Servers for seal shard signatures
   */
  async fetchSealShardKeyShares(
    counterId: string,
    signer: Ed25519Keypair,
    threshold: number,
    keyServerIds: string[] = [
      "0x164ac3d2b3b8694b8181c13f671950004765c23f270321a45fdd04d40cccf0f2", // Studio Mirai
      "0x6068c0acb197dddbacd4746a9de7f025b2ed5a5b6c1b1ab44dade4426d141da2", // Ruby Node
      "0x5466b7df5c15b508678d51496ada8afab0d6f70a01c10613123382b1b8131007", // NodeInfra
    ],
  ): Promise<SealShardKeyShare[]> {
    // Create InnerID: counter_id || signer_address
    const counterIdBytes = Array.from(Buffer.from(counterId.replace("0x", ""), "hex"));
    const signerAddressBytes = Array.from(
      Buffer.from(signer.getPublicKey().toSuiAddress().replace("0x", ""), "hex"),
    );
    const innerIdBytes = [...counterIdBytes, ...signerAddressBytes];

    const keyShares: SealShardKeyShare[] = [];

    for (let i = 0; i < Math.min(threshold, keyServerIds.length); i++) {
      const keyServerId = keyServerIds[i];

      // Step 1: Create SessionKey for this Key Server
      const sessionKey = await SessionKey.create({
        suiClient: this.suiClient,
        keyServerId,
      });

      // Step 2: Execute seal_approve transaction
      const tx = new Transaction();
      tx.moveCall({
        target: `${counterPackage.packageId}::multi_ibs_counter::seal_approve`,
        arguments: [tx.pure.vector("u8", innerIdBytes), tx.object(counterId)],
      });

      const approveResult = await this.suiClient.signAndExecuteTransaction({
        signer,
        transaction: tx,
        options: { showEffects: true },
      });

      if (approveResult.effects?.status?.status !== "success") {
        throw new Error(
          `Seal approve failed for server ${i}: ${approveResult.effects?.status?.error}`,
        );
      }

      // Step 3: Get derived keys from Seal
      const derivedKeys = await this.sealClient.getDerivedKeys({
        sessionKey,
        keyServerId,
        innerIds: [innerIdBytes],
      });

      if (!derivedKeys || derivedKeys.length === 0) {
        throw new Error(`No derived keys returned for server ${i}`);
      }

      const derivedKey = derivedKeys[0];

      // Step 4: Get public key from Seal Key Server
      const publicKey = await this.getSealShardPublicKey(keyServerId);

      keyShares.push({
        serverIndex: i,
        serverId: keyServerId,
        secretKey: new Uint8Array(derivedKey.key),
        publicKey,
      });
    }
    return keyShares;
  }

  /**
   * Get public key from Seal Key Server object
   */
  async getSealShardPublicKey(keyServerId: string): Promise<Uint8Array> {
    // Get dynamic fields from the Key Server
    const dynamicFields = await this.suiClient.getDynamicFields({
      parentId: keyServerId,
    });

    if (!dynamicFields.data || dynamicFields.data.length === 0) {
      throw new Error("No dynamic fields found in Key Server");
    }

    // Find the version 1 dynamic field
    const v1Field = dynamicFields.data.find(
      (field) => field.name.type === "u64" && field.name.value === "1",
    );

    if (!v1Field) {
      throw new Error("Version 1 Key Server field not found");
    }

    // Get the dynamic field object
    const fieldObj = await this.suiClient.getDynamicFieldObject({
      parentId: keyServerId,
      name: v1Field.name,
    });

    if (!fieldObj.data?.content || fieldObj.data.content.dataType !== "moveObject") {
      throw new Error("Invalid Key Server dynamic field object");
    }

    const fields = (fieldObj.data.content as KeyServerDynamicFieldContent).fields;
    const pkArray = fields.value?.fields?.pk;

    if (!pkArray || !Array.isArray(pkArray)) {
      throw new Error("Key Server public key not found in dynamic field");
    }

    // Convert pk field to Uint8Array
    return new Uint8Array(pkArray);
  }

  /**
   * Aggregate public keys from seal shard key shares
   */
  aggregatePublicKeys(keyShares: SealShardKeyShare[]): Uint8Array {
    if (keyShares.length === 0) {
      throw new Error("No key shares to aggregate");
    }

    // Convert first public key to Point
    let aggregatedPK = bls12_381.G2.Point.fromBytes(keyShares[0].publicKey);

    // Add remaining public keys
    for (let i = 1; i < keyShares.length; i++) {
      const pubKeyPoint = bls12_381.G2.Point.fromBytes(keyShares[i].publicKey);
      aggregatedPK = aggregatedPK.add(pubKeyPoint);
    }

    return aggregatedPK.toBytes();
  }

  /**
   * Aggregate secret keys using modular addition
   */
  aggregateSecretKeys(keyShares: SealShardKeyShare[]): Uint8Array {
    if (keyShares.length === 0) {
      throw new Error("No secret key shares to aggregate");
    }

    // Convert first key to bigint
    let aggregated = this.bytesToBigInt(keyShares[0].secretKey);

    // Add remaining keys modulo curve order
    for (let i = 1; i < keyShares.length; i++) {
      const keyBigInt = this.bytesToBigInt(keyShares[i].secretKey);
      aggregated = (aggregated + keyBigInt) % bls12_381.fields.Fr.ORDER;
    }

    return this.bigIntToBytes(aggregated, 32);
  }

  /**
   * Create Multi-IBS signature for seal shards
   */
  createSealShardSignature(
    aggregatedSecretKey: Uint8Array,
    message: string,
    _signer?: string,
  ): { signature: Uint8Array; message: Uint8Array } {
    const messageBytes = new TextEncoder().encode(message);

    // Hash message to G1 curve point with Move contract domain separation
    const messageWithDomain = new Uint8Array([
      ...new TextEncoder().encode("SUI-SEAL-SHARD-V1"),
      ...messageBytes,
    ]);
    const DST = "BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_";
    const hashedMessage = blss.hash(messageWithDomain, DST);

    // Create G1 signature
    const signature = blss.sign(hashedMessage, aggregatedSecretKey);

    return {
      signature: signature.toBytes(),
      message: messageBytes,
    };
  }

  // Helper functions
  private bytesToBigInt(bytes: Uint8Array): bigint {
    let result = 0n;
    for (let i = 0; i < bytes.length; i++) {
      result = (result << 8n) + BigInt(bytes[i]);
    }
    return result;
  }

  private bigIntToBytes(value: bigint, length: number): Uint8Array {
    const result = new Uint8Array(length);
    let currentValue = value;
    for (let i = length - 1; i >= 0; i--) {
      result[i] = Number(currentValue & 0xffn);
      currentValue >>= 8n;
    }
    return result;
  }
}
