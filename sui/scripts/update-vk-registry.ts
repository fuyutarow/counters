/**
 * Update Verifying Key Registry
 *
 * Loads the verifying key from public/circuits/keys/private_counter_vk.json
 * and uploads it to the VerifyingKeyRegistry shared object.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { serializeVerifyingKey, type VerifyingKey } from "../src/utils/verifyingKey";

// Network configuration
const NETWORK = "testnet";
const VK_REGISTRY_ID = "0x7a6f532b9c0e0ee493b93592df2515fb32677143053c5ea60e007c3686dd2c3a";
const PACKAGE_ID = "0x52cc7a2752d5668afb0eda873a26ec0d9a687366ac48066760fdc5fa25656f90";

async function main() {
  // Load verifying key
  const vkPath = path.join(process.cwd(), "public/circuits/keys/private_counter_vk.json");

  const vkJson = JSON.parse(fs.readFileSync(vkPath, "utf-8")) as VerifyingKey;

  // Serialize to bytes
  const vkBytes = serializeVerifyingKey(vkJson);

  // Setup Sui client
  const client = new SuiClient({ url: getFullnodeUrl(NETWORK) });

  // Load keypair from environment or default location
  const privateKeyBase64 = process.env.SUI_PRIVATE_KEY;
  if (!privateKeyBase64) {
    throw new Error(
      "SUI_PRIVATE_KEY environment variable not set. Export your private key with: export SUI_PRIVATE_KEY=$(sui keytool export --key-identity <address>)",
    );
  }

  const keypair = Ed25519Keypair.fromSecretKey(Buffer.from(privateKeyBase64, "base64"));
  const _address = keypair.getPublicKey().toSuiAddress();

  // Create transaction
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::private_counter::update_verifying_key`,
    arguments: [tx.object(VK_REGISTRY_ID), tx.pure.vector("u8", Array.from(vkBytes))],
  });
  const result = await client.signAndExecuteTransaction({
    transaction: tx,
    signer: keypair,
    options: {
      showEffects: true,
      showObjectChanges: true,
    },
  });

  if (result.effects?.status?.status !== "success") {
    process.exit(1);
  }
}

main().catch((_error) => {
  process.exit(1);
});
