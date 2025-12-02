import { fromPromise } from "neverthrow";
import { type NextRequest, NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { anvil } from "viem/chains";

// Anvil's default test account private key
const ANVIL_TEST_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const ANVIL_RPC_URL = "http://localhost:8545";

export async function POST(request: NextRequest) {
  const bodyResult = await fromPromise(request.json() as Promise<{ address?: string }>, (e) =>
    e instanceof Error ? e : new Error("Failed to parse request body"),
  );

  if (bodyResult.isErr()) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { address } = bodyResult.value;

  if (!address) {
    return NextResponse.json({ error: "Address is required" }, { status: 400 });
  }

  // Create viem clients
  const publicClient = createPublicClient({
    chain: anvil,
    transport: http(ANVIL_RPC_URL),
  });

  const account = privateKeyToAccount(ANVIL_TEST_PRIVATE_KEY);
  const walletClient = createWalletClient({
    account,
    chain: anvil,
    transport: http(ANVIL_RPC_URL),
  });

  // Check if Anvil is running
  const chainIdResult = await fromPromise(
    publicClient.getChainId(),
    () => new Error("Anvil is not running"),
  );

  if (chainIdResult.isErr()) {
    return NextResponse.json(
      { error: "Anvil is not running. Please start Anvil first." },
      { status: 503 },
    );
  }

  // Send 10 ETH to the requested address
  const txResult = await fromPromise(
    walletClient.sendTransaction({
      to: address as `0x${string}`,
      value: parseEther("10"),
    }),
    (e) => (e instanceof Error ? e : new Error("Failed to send transaction")),
  );

  if (txResult.isErr()) {
    return NextResponse.json(
      {
        error: "Failed to send test ETH",
        details: txResult.error.message,
      },
      { status: 500 },
    );
  }

  const txHash = txResult.value;

  // Wait for transaction confirmation
  const receiptResult = await fromPromise(
    publicClient.waitForTransactionReceipt({ hash: txHash }),
    (e) => (e instanceof Error ? e : new Error("Failed to wait for receipt")),
  );

  if (receiptResult.isErr()) {
    return NextResponse.json(
      {
        error: "Transaction sent but confirmation failed",
        txHash,
        details: receiptResult.error.message,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    txHash,
    amount: "10 ETH",
  });
}
