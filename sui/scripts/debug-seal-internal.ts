/**
 * Debug Seal SDK internal ID construction
 */

import { SealClient, SessionKey } from "@mysten/seal";
import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { getKeypair } from "../__tests__/utils/keybook.js";

const debugSealInternal = async () => {
  // Setup client and keys
  const suiClient = new SuiClient({ url: "https://fullnode.testnet.sui.io:443" });

  // Testnet Key Server configurations from seal docs
  const keyServerConfigs = [
    {
      objectId: "0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75",
      url: "https://seal-key-server-testnet-1.mystenlabs.com",
    },
    {
      objectId: "0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8",
      url: "https://seal-key-server-testnet-2.mystenlabs.com",
    },
    {
      objectId: "0x6068c0acb197dddbacd4746a9de7f025b2ed5a5b6c1b1ab44dade4426d141da2",
      url: "https://seal-testnet.api.rubynodes.io",
    },
  ];

  const sealClient = new SealClient({
    suiClient,
    serverConfigs: keyServerConfigs,
  });

  const primeKeyInfo = getKeypair("PRIME");
  const keypair = primeKeyInfo.keypair;
  const signerAddress = keypair.getPublicKey().toSuiAddress();

  // Fixed values for debugging
  const counterId = "0x70fd563ae69f17caf9d6c05145a2c7643d3c3c3564a227820bfa5fe728e8a1c9";
  const message = "debug-seal-internal";
  const COUNTER_PACKAGE_ID = "0x7f4c678e4e984896892e7726e0248ee08efc85aa72da8935848fc9ca2479471a";

  // Step 1: Manual IBE ID construction (TypeScript side)
  // Remove 0x prefix and convert hex to bytes
  const counterIdBytes = Array.from(Buffer.from(counterId.replace("0x", ""), "hex"));
  const signerAddressBytes = Array.from(Buffer.from(signerAddress.replace("0x", ""), "hex"));
  const messageBytes = Buffer.from(message, "utf-8");

  // Domain separation
  const DOMAIN_SEPARATOR = "SUI-MULTI-IBS-V1";
  const domainBytes = Buffer.from(DOMAIN_SEPARATOR, "utf-8");
  const messageWithDomain = Buffer.concat([domainBytes, messageBytes]);

  // IBE ID: counter_id || signer || domain+message
  const ibeIdBytes = [...counterIdBytes, ...signerAddressBytes, ...Array.from(messageWithDomain)];
  const ibeIdHex = `0x${Buffer.from(ibeIdBytes).toString("hex")}`;

  // Step 2: Create SessionKey and see what package ID it uses
  const sessionKey = await SessionKey.create({
    address: signerAddress,
    packageId: COUNTER_PACKAGE_ID,
    ttlMin: 10,
    signer: keypair,
    suiClient,
  });

  // Step 3: Create transaction for txBytes
  const approveTx = new Transaction();
  approveTx.moveCall({
    target: `${COUNTER_PACKAGE_ID}::multi_ibs_counter::seal_approve`,
    arguments: [
      approveTx.pure.vector("u8", ibeIdBytes),
      approveTx.object(counterId),
      approveTx.pure.vector("u8", Array.from(messageBytes)),
    ],
  });

  const txBytes = await approveTx.build({
    client: suiClient,
    onlyTransactionKind: true,
  });

  try {
    const derivedKeys = await sealClient.getDerivedKeys({
      id: ibeIdHex,
      sessionKey,
      txBytes,
      threshold: 2,
    });

    for (const [_serverId, _derivedKey] of derivedKeys) {
    }
  } catch (_error) {}
};

// Run debug
debugSealInternal().catch(console.error);
