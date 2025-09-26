#!/usr/bin/env tsx

/**
 * Multi-IBS署名集約スクリプト
 *
 * 複数のSeal Key Serverから署名を取得し、BLS署名集約を行って
 * オンチェーンでの検証用データを準備する
 */

import { SealClient, SessionKey } from "@mysten/seal";
import { bcs } from "@mysten/sui/bcs";
import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";

// Configuration
const NETWORK = "testnet";
const PACKAGE_ID = "0x1234567890abcdef"; // TODO: Replace with actual package ID

// Key Server configurations (from our earlier research)
const KEY_SERVERS = [
  {
    name: "Studio Mirai",
    objectId: "0x164ac3d2b3b8694b8181c13f671950004765c23f270321a45fdd04d40cccf0f2",
  },
  {
    name: "Ruby Node",
    objectId: "0x6068c0acb197dddbacd4746a9de7f025b2ed5a5b6c1b1ab44dade4426d141da2",
  },
  {
    name: "NodeInfra",
    objectId: "0x5466b7df5c15b508678d51496ada8afab0d6f70a01c10613123382b1b8131007",
  },
];

const THRESHOLD = 2; // 2-of-3 signatures required

interface SignatureBundle {
  keyServerIndex: number;
  signature: Uint8Array; // G1 signature (48 bytes)
  keyServerId: string;
}

interface AggregatedSignatureData {
  aggregatedSignature: Uint8Array;
  signerIndices: number[];
  message: Uint8Array;
}

class MultiIBSAggregator {
  private suiClient: SuiClient;
  private sealClient: SealClient;

  constructor() {
    this.suiClient = new SuiClient({ url: getFullnodeUrl(NETWORK) });
    this.sealClient = new SealClient({
      suiClient: this.suiClient,
      serverConfigs: KEY_SERVERS.map((server) => ({
        objectId: server.objectId,
        weight: 1,
      })),
      verifyKeyServers: false,
    });
  }

  /**
   * Create Multi-IBS configuration on-chain
   */
  async createConfig(signer: Ed25519Keypair): Promise<string> {
    const tx = new Transaction();

    // Extract Key Server IDs for the config
    const keyServerIds = KEY_SERVERS.map((server) => server.objectId);

    tx.moveCall({
      target: `${PACKAGE_ID}::multi_ibs_counter::share_config`,
      arguments: [
        tx.pure.address(PACKAGE_ID),
        tx.pure.vector("address", keyServerIds),
        tx.pure.u64(THRESHOLD),
      ],
    });

    const result = await this.suiClient.signAndExecuteTransaction({
      signer,
      transaction: tx,
      options: { showEffects: true, showObjectChanges: true },
    });

    // Extract shared object ID
    const sharedObject = result.objectChanges?.find(
      (change) => change.type === "created" && change.objectType?.includes("MultiIBSConfig"),
    );

    if (!sharedObject || sharedObject.type !== "created") {
      throw new Error("Failed to create config");
    }

    return sharedObject.objectId;
  }

  /**
   * Create Multi-IBS counter on-chain
   */
  async createCounter(configId: string, signer: Ed25519Keypair): Promise<string> {
    const tx = new Transaction();

    tx.moveCall({
      target: `${PACKAGE_ID}::multi_ibs_counter::share_counter`,
      arguments: [tx.object(configId)],
    });

    const result = await this.suiClient.signAndExecuteTransaction({
      signer,
      transaction: tx,
      options: { showEffects: true, showObjectChanges: true },
    });

    const sharedObject = result.objectChanges?.find(
      (change) => change.type === "created" && change.objectType?.includes("MultiIBSCounter"),
    );

    if (!sharedObject || sharedObject.type !== "created") {
      throw new Error("Failed to create counter");
    }

    return sharedObject.objectId;
  }

  /**
   * Collect signatures from Key Servers
   */
  async collectSignatures(
    message: string,
    signerKeypairs: Ed25519Keypair[],
    requiredCount: number = THRESHOLD,
  ): Promise<SignatureBundle[]> {
    const messageBytes = new TextEncoder().encode(message);
    const signatures: SignatureBundle[] = [];

    // For demo purposes, we'll collect from the first N servers
    const serversToUse = KEY_SERVERS.slice(0, requiredCount);

    for (let i = 0; i < serversToUse.length; i++) {
      const server = serversToUse[i];
      const keypair = signerKeypairs[i];

      try {
        // Create session key for this signer
        const sessionKey = await SessionKey.create({
          address: keypair.getPublicKey().toSuiAddress(),
          packageId: PACKAGE_ID,
          ttlMin: 10,
          signer: keypair,
          suiClient: this.suiClient,
        });

        // Prepare identity for IBS (signer's address as ID)
        const signerAddress = keypair.getPublicKey().toSuiAddress();
        const identityBytes = bcs.Address.serialize(signerAddress).toBytes();
        const identityHex = `0x${Buffer.from(identityBytes).toString("hex")}`;

        // Get encrypted data (placeholder - in real usage this would be actual encrypted data)
        const _encryptedData = await this.sealClient.encrypt({
          threshold: 1,
          packageId: PACKAGE_ID,
          id: identityHex,
          data: messageBytes,
        });

        // Create approval transaction
        const approveTx = new Transaction();
        approveTx.moveCall({
          target: `${PACKAGE_ID}::multi_ibs_counter::approve_for_signature`,
          arguments: [
            approveTx.pure.vector("u8", Array.from(identityBytes)),
            approveTx.pure.vector("u8", Array.from(messageBytes)),
          ],
        });

        const approveTxBytes = await approveTx.build({
          client: this.suiClient,
          onlyTransactionKind: true,
        });

        // Fetch keys and decrypt to get signature
        await this.sealClient.fetchKeys({
          ids: [identityHex],
          sessionKey,
          txBytes: approveTxBytes,
          threshold: 1,
        });

        // For demo purposes, generate a mock BLS signature
        // In practice, this would come from the Key Server's IBS signing
        const mockSignature = this.generateMockSignature(messageBytes, i);

        signatures.push({
          keyServerIndex: i,
          signature: mockSignature,
          keyServerId: server.objectId,
        });
      } catch (_error) {
        // For demo, continue with mock signature
        const mockSignature = this.generateMockSignature(messageBytes, i);
        signatures.push({
          keyServerIndex: i,
          signature: mockSignature,
          keyServerId: server.objectId,
        });
      }
    }

    return signatures;
  }

  /**
   * Aggregate G1 signatures using BLS12-381
   */
  aggregateSignatures(signatures: SignatureBundle[], message: string): AggregatedSignatureData {
    if (signatures.length === 0) {
      throw new Error("No signatures to aggregate");
    }

    // Aggregate G1 signatures: σ_agg = σ₁ + σ₂ + ... + σₙ
    let aggregated = signatures[0].signature;

    for (let i = 1; i < signatures.length; i++) {
      // Note: This is a simplified aggregation
      // In practice, you'd use proper BLS12-381 G1 addition
      aggregated = this.addG1Points(aggregated, signatures[i].signature);
    }

    const signerIndices = signatures.map((sig) => sig.keyServerIndex);
    const messageBytes = new TextEncoder().encode(message);

    return {
      aggregatedSignature: aggregated,
      signerIndices,
      message: messageBytes,
    };
  }

  /**
   * Submit aggregated signature for verification and increment counter
   */
  async verifyAndIncrement(
    counterId: string,
    configId: string,
    aggregatedData: AggregatedSignatureData,
    signer: Ed25519Keypair,
  ): Promise<void> {
    const tx = new Transaction();

    // Call verify_and_mint_proof
    const proof = tx.moveCall({
      target: `${PACKAGE_ID}::multi_ibs_counter::verify_and_mint_proof`,
      arguments: [
        tx.object(counterId),
        tx.object(configId),
        tx.pure.bcs(
          bcs.struct("AggregatedSignature", {
            signature_g1: bcs.vector(bcs.u8()),
            signer_indices: bcs.vector(bcs.u32()),
            message: bcs.vector(bcs.u8()),
          }),
          {
            signature_g1: Array.from(aggregatedData.aggregatedSignature),
            signer_indices: aggregatedData.signerIndices,
            message: Array.from(aggregatedData.message),
          },
        ),
      ],
    });

    // Call increment with the proof
    tx.moveCall({
      target: `${PACKAGE_ID}::multi_ibs_counter::increment`,
      arguments: [tx.object(counterId), proof],
    });

    const _result = await this.suiClient.signAndExecuteTransaction({
      signer,
      transaction: tx,
      options: { showEffects: true },
    });
  }

  // === Helper Methods ===

  /**
   * Generate mock signature for demonstration
   */
  private generateMockSignature(message: Uint8Array, nonce: number): Uint8Array {
    // This is a placeholder - in practice, signatures would come from Key Servers
    const mockSig = new Uint8Array(48); // BLS G1 signature is 48 bytes

    // Fill with some deterministic but different data per signer
    for (let i = 0; i < 48; i++) {
      mockSig[i] = (message[i % message.length] + nonce + i) % 256;
    }

    return mockSig;
  }

  /**
   * Simplified G1 point addition (placeholder)
   */
  private addG1Points(point1: Uint8Array, point2: Uint8Array): Uint8Array {
    // This is a placeholder - in practice you'd use proper BLS12-381 library
    const result = new Uint8Array(48);
    for (let i = 0; i < 48; i++) {
      result[i] = (point1[i] + point2[i]) % 256;
    }
    return result;
  }
}

// Main execution function
async function main() {
  const aggregator = new MultiIBSAggregator();

  // Create test keypairs
  const adminKeypair = Ed25519Keypair.generate();
  const signerKeypairs = [
    Ed25519Keypair.generate(),
    Ed25519Keypair.generate(),
    Ed25519Keypair.generate(),
  ];

  try {
    // 1. Create configuration
    const configId = await aggregator.createConfig(adminKeypair);

    // 2. Create counter
    const counterId = await aggregator.createCounter(configId, adminKeypair);

    // 3. Collect signatures
    const message = "increment-counter-123";
    const signatures = await aggregator.collectSignatures(message, signerKeypairs, THRESHOLD);

    // 4. Aggregate signatures
    const aggregatedData = aggregator.aggregateSignatures(signatures, message);

    // 5. Verify and increment
    await aggregator.verifyAndIncrement(counterId, configId, aggregatedData, adminKeypair);
  } catch (_error) {
    process.exit(1);
  }
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { MultiIBSAggregator };
