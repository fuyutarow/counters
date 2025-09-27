import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";

const client = new SuiClient({ url: getFullnodeUrl("testnet") });
const _keypair = Ed25519Keypair.generate();
const COUNTER_PACKAGE_ID = "0x0ef40761dca8c5997f66786a9a54dc760f106a951928dff3f9245e73d94b2149";

// Test simple call to seal_approve_multi_ibs
async function testSealApprove() {
  const tx = new Transaction();

  // Create dummy counter and inner ID for testing
  const dummyCounterId = `0x${"0".repeat(64)}`;
  const dummyInnerIdBytes = [1, 2, 3, 4]; // dummy bytes

  try {
    tx.moveCall({
      target: `${COUNTER_PACKAGE_ID}::multi_ibs_counter::seal_approve_multi_ibs`,
      arguments: [tx.pure.vector("u8", dummyInnerIdBytes), tx.object(dummyCounterId)],
    });

    // Just build the transaction to see if function exists
    await tx.build({ client });
  } catch (_error) {}
}

testSealApprove();
