/**
 * Self Sponsored Transaction Routes (1RT - Pre-allocated Coin)
 *
 * Backend pays gas using its own keypair with pre-allocated coins.
 *
 * POST /api/tx/self/allocate - Split and allocate a coin for user
 * GET  /api/tx/self/coin/:address - Get user's allocated coin (fresh version/digest)
 * POST /api/tx/self/execute-preallocated - Execute with pre-allocated coin (1RT)
 * GET  /api/tx/self/balance - Check sponsor balance
 *
 * Flow:
 * 1. Client calls /allocate once to get a dedicated coin
 * 2. Client builds tx with known coin ID, signs locally
 * 3. Client calls /execute-preallocated with txBytes + signature (1RT!)
 */

import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import consola from "consola";
import { Hono } from "hono";
import { err, ok, type Result, ResultAsync } from "neverthrow";

import { serverEnv } from "@/env/server";
import { type NetworkName } from "@/networkConstants";

// In-memory store for allocated coins per user (production: use Redis or DB)
// Only stores address → coinId mapping. Version/digest must be fetched fresh.
const allocatedCoins = new Map<
  string, // userAddress
  {
    coinId: string;
    network: NetworkName;
    allocatedAt: number;
  }
>();

function normalizeNetwork(network: string): NetworkName {
  if (network === "devnet" || network === "mainnet" || network === "testnet") {
    return network;
  }
  return "testnet";
}

function getSponsorKeypair(): Result<Ed25519Keypair, Error> {
  const privateKey = serverEnv.SPONSOR_PRIVATE_KEY;
  if (!privateKey) {
    return err(new Error("SPONSOR_PRIVATE_KEY is not configured"));
  }
  return ok(Ed25519Keypair.fromSecretKey(privateKey));
}

function getSuiClient(network: NetworkName): SuiClient {
  return new SuiClient({ url: getFullnodeUrl(network) });
}

export const selfSponsorRoutes = new Hono()
  // POST /api/tx/self/allocate - Allocate a coin for a user
  .post("/allocate", async (c) => {
    const parseResult = await ResultAsync.fromPromise(
      c.req.json() as Promise<{
        userAddress?: string;
        network?: string;
        amount?: number; // Amount in MIST (default: 100_000_000 = 0.1 SUI)
      }>,
      () => new Error("Invalid JSON body"),
    ).andThen(({ userAddress, network = "testnet", amount = 100_000_000 }) => {
      if (!userAddress) {
        return err(new Error("Missing userAddress"));
      }
      return ok({ userAddress, network: normalizeNetwork(network), amount });
    });

    if (parseResult.isErr()) {
      return c.json({ error: parseResult.error.message }, 400);
    }

    const { userAddress, network, amount } = parseResult.value;

    const keypairResult = getSponsorKeypair();
    if (keypairResult.isErr()) {
      return c.json({ error: keypairResult.error.message }, 500);
    }

    const sponsorKeypair = keypairResult.value;
    const sponsor = sponsorKeypair.toSuiAddress();
    const suiClient = getSuiClient(network);

    // Check if user already has an allocated coin
    const existing = allocatedCoins.get(userAddress);
    if (existing && existing.network === network) {
      // Verify the coin still exists and get fresh version/digest
      const coinResult = await ResultAsync.fromPromise(
        suiClient.getObject({
          id: existing.coinId,
          options: { showOwner: true },
        }),
        (e) => (e instanceof Error ? e : new Error("Failed to get coin")),
      );

      if (coinResult.isOk() && coinResult.value.data) {
        const coin = coinResult.value.data;
        const { version, digest } = coin;

        if (!version || !digest) {
          allocatedCoins.delete(userAddress);
          return c.json({ error: "Coin missing version or digest" }, 500);
        }

        consola.info("[Self-Sponsor] Returning existing allocated coin", {
          userAddress,
          coinId: existing.coinId,
        });

        // Return fresh version/digest from network
        return c.json({
          coinId: existing.coinId,
          version,
          digest,
          sponsor,
          network,
          isExisting: true,
        });
      }
      // Coin no longer exists, remove from map and allocate new one
      allocatedCoins.delete(userAddress);
    }

    // Get sponsor's coins
    const coinsResult = await ResultAsync.fromPromise(
      suiClient.getCoins({
        owner: sponsor,
        coinType: "0x2::sui::SUI",
      }),
      (e) => (e instanceof Error ? e : new Error("Failed to get coins")),
    );

    if (coinsResult.isErr()) {
      return c.json({ error: coinsResult.error.message }, 500);
    }

    const coins = coinsResult.value.data;
    if (coins.length === 0) {
      return c.json({ error: "Sponsor has no SUI coins" }, 500);
    }

    // Find a coin with enough balance to split
    const sourceCoin = coins.find((c) => BigInt(c.balance) > BigInt(amount) + 10_000_000n);
    if (!sourceCoin) {
      return c.json({ error: "No coin with sufficient balance for split" }, 500);
    }

    // Split coin from gas payment (tx.gas) to avoid object overlap
    const tx = new Transaction();
    // Use tx.gas to split from the gas coin - this avoids the "mutable object cannot appear more than once" error
    const [newCoin] = tx.splitCoins(tx.gas, [amount]);
    tx.transferObjects([newCoin], sponsor); // Transfer to sponsor (we manage it)
    tx.setSender(sponsor);
    tx.setGasOwner(sponsor);

    // Build and sign
    const buildResult = await ResultAsync.fromPromise(tx.build({ client: suiClient }), (e) =>
      e instanceof Error ? e : new Error("Failed to build split transaction"),
    );

    if (buildResult.isErr()) {
      return c.json({ error: buildResult.error.message }, 500);
    }

    const signResult = await ResultAsync.fromPromise(
      sponsorKeypair.signTransaction(buildResult.value),
      (e) => (e instanceof Error ? e : new Error("Failed to sign split transaction")),
    );

    if (signResult.isErr()) {
      return c.json({ error: signResult.error.message }, 500);
    }

    // Execute
    const executeResult = await ResultAsync.fromPromise(
      suiClient.executeTransactionBlock({
        transactionBlock: Buffer.from(buildResult.value).toString("base64"),
        signature: [signResult.value.signature],
        options: {
          showEffects: true,
          showObjectChanges: true,
        },
        requestType: "WaitForLocalExecution",
      }),
      (e) => (e instanceof Error ? e : new Error("Failed to execute split transaction")),
    );

    if (executeResult.isErr()) {
      return c.json({ error: executeResult.error.message }, 500);
    }

    // Find the newly created coin from object changes
    const objectChanges = executeResult.value.objectChanges || [];
    const createdCoin = objectChanges.find(
      (change) =>
        change.type === "created" &&
        "objectType" in change &&
        change.objectType === "0x2::coin::Coin<0x2::sui::SUI>",
    );

    if (!createdCoin || createdCoin.type !== "created") {
      return c.json({ error: "Failed to find created coin in transaction result" }, 500);
    }

    // Wait for transaction finalization
    const waitResult = await ResultAsync.fromPromise(
      suiClient.waitForTransaction({
        digest: executeResult.value.digest,
        options: { showObjectChanges: true },
      }),
      (e) => (e instanceof Error ? e : new Error("Failed to wait for transaction")),
    );

    if (waitResult.isErr()) {
      return c.json({ error: waitResult.error.message }, 500);
    }

    // Get fresh coin state
    const freshCoinResult = await ResultAsync.fromPromise(
      suiClient.getObject({
        id: createdCoin.objectId,
        options: { showOwner: true },
      }),
      (e) => (e instanceof Error ? e : new Error("Failed to get fresh coin state")),
    );

    if (freshCoinResult.isErr() || !freshCoinResult.value.data) {
      return c.json({ error: "Failed to get fresh coin state" }, 500);
    }

    const freshCoin = freshCoinResult.value.data;
    const { version: freshVersion, digest: freshDigest } = freshCoin;

    if (!freshVersion || !freshDigest) {
      return c.json({ error: "Fresh coin missing version or digest" }, 500);
    }

    // Store allocation (only coinId, version/digest fetched fresh each time)
    allocatedCoins.set(userAddress, {
      coinId: createdCoin.objectId,
      network,
      allocatedAt: Date.now(),
    });

    consola.success("[Self-Sponsor] Allocated new coin", {
      userAddress,
      coinId: createdCoin.objectId,
      amount,
      txDigest: executeResult.value.digest,
    });

    return c.json({
      coinId: createdCoin.objectId,
      version: freshVersion,
      digest: freshDigest,
      sponsor,
      network,
      isExisting: false,
      txDigest: executeResult.value.digest,
    });
  })
  // GET /api/tx/self/coin/:address - Get allocated coin for user
  .get("/coin/:address", async (c) => {
    const userAddress = c.req.param("address");
    const network = normalizeNetwork(c.req.query("network") ?? "testnet");

    const allocation = allocatedCoins.get(userAddress);
    if (!allocation || allocation.network !== network) {
      return c.json({ error: "No allocated coin found" }, 404);
    }

    const suiClient = getSuiClient(network);

    // Get fresh coin state
    const coinResult = await ResultAsync.fromPromise(
      suiClient.getObject({
        id: allocation.coinId,
        options: { showOwner: true, showContent: true },
      }),
      (e) => (e instanceof Error ? e : new Error("Failed to get coin")),
    );

    if (coinResult.isErr() || !coinResult.value.data) {
      allocatedCoins.delete(userAddress);
      return c.json({ error: "Allocated coin no longer exists" }, 404);
    }

    const coin = coinResult.value.data;
    const { version, digest } = coin;

    if (!version || !digest) {
      allocatedCoins.delete(userAddress);
      return c.json({ error: "Coin missing version or digest" }, 500);
    }

    // Return fresh version/digest from network (not stored)
    return c.json({
      coinId: allocation.coinId,
      version,
      digest,
      network,
    });
  })
  // POST /api/tx/self/execute-preallocated - Execute transaction with pre-allocated coin (1RT)
  .post("/execute-preallocated", async (c) => {
    const parseResult = await ResultAsync.fromPromise(
      c.req.json() as Promise<{
        txBytes?: string;
        userSignature?: string;
        userAddress?: string;
        network?: string;
      }>,
      () => new Error("Invalid JSON body"),
    ).andThen(({ txBytes, userSignature, userAddress, network = "testnet" }) => {
      if (!txBytes) {
        return err(new Error("Missing txBytes"));
      }
      if (!userSignature) {
        return err(new Error("Missing userSignature"));
      }
      if (!userAddress) {
        return err(new Error("Missing userAddress"));
      }
      return ok({ txBytes, userSignature, userAddress, network: normalizeNetwork(network) });
    });

    if (parseResult.isErr()) {
      return c.json({ error: parseResult.error.message }, 400);
    }

    const { txBytes, userSignature, userAddress, network } = parseResult.value;

    // Verify user has an allocated coin
    const allocation = allocatedCoins.get(userAddress);
    if (!allocation || allocation.network !== network) {
      return c.json({ error: "No allocated coin found for user" }, 404);
    }

    const keypairResult = getSponsorKeypair();
    if (keypairResult.isErr()) {
      return c.json({ error: keypairResult.error.message }, 500);
    }

    const sponsorKeypair = keypairResult.value;
    const suiClient = getSuiClient(network);

    // Decode transaction bytes
    const txBytesBuffer = Buffer.from(txBytes, "base64");

    // Sign with sponsor keypair
    const signResult = await ResultAsync.fromPromise(
      sponsorKeypair.signTransaction(txBytesBuffer),
      (e) => (e instanceof Error ? e : new Error("Failed to sign transaction")),
    );

    if (signResult.isErr()) {
      consola.error("[Self-Sponsor] Failed to sign pre-allocated transaction", {
        error: signResult.error.message,
      });
      return c.json({ error: signResult.error.message }, 500);
    }

    const sponsorSignature = signResult.value.signature;

    // Execute with both signatures (1RT - single API call!)
    const executeResult = await ResultAsync.fromPromise(
      suiClient.executeTransactionBlock({
        transactionBlock: txBytes,
        signature: [userSignature, sponsorSignature],
        options: {
          showEffects: true,
          showObjectChanges: true,
          showEvents: true,
        },
        requestType: "WaitForLocalExecution",
      }),
      (e) => (e instanceof Error ? e : new Error("Failed to execute transaction")),
    );

    if (executeResult.isErr()) {
      const errorMsg = executeResult.error.message;
      // Check for version mismatch
      if (errorMsg.includes("version") || errorMsg.includes("ObjectVersionUnavailable")) {
        consola.warn("[Self-Sponsor] Coin version mismatch", { userAddress });
        return c.json({ error: errorMsg, needsRefresh: true }, 409);
      }
      consola.error("[Self-Sponsor] Failed to execute pre-allocated transaction", {
        error: errorMsg,
      });
      return c.json({ error: errorMsg }, 500);
    }

    // Wait for finalization
    const waitResult = await ResultAsync.fromPromise(
      suiClient.waitForTransaction({
        digest: executeResult.value.digest,
        options: {
          showEffects: true,
          showObjectChanges: true,
          showEvents: true,
        },
      }),
      (e) => (e instanceof Error ? e : new Error("Failed to wait for transaction")),
    );

    if (waitResult.isErr()) {
      consola.error("[Self-Sponsor] Failed to wait for pre-allocated transaction", {
        error: waitResult.error.message,
      });
      return c.json({ error: waitResult.error.message }, 500);
    }

    consola.success("[Self-Sponsor] Pre-allocated transaction executed (1RT)", {
      digest: waitResult.value.digest,
      success: waitResult.value.effects?.status?.status === "success",
      userAddress,
    });

    return c.json({
      digest: waitResult.value.digest,
      success: waitResult.value.effects?.status?.status === "success",
    });
  })
  // GET /api/tx/self/balance - Check sponsor balance
  .get("/balance", async (c) => {
    const network = normalizeNetwork(c.req.query("network") ?? "testnet");

    const keypairResult = getSponsorKeypair();
    if (keypairResult.isErr()) {
      return c.json({ error: keypairResult.error.message }, 500);
    }

    const sponsor = keypairResult.value.toSuiAddress();
    const suiClient = getSuiClient(network);

    const balanceResult = await ResultAsync.fromPromise(
      suiClient.getBalance({
        owner: sponsor,
        coinType: "0x2::sui::SUI",
      }),
      (e) => (e instanceof Error ? e : new Error("Failed to get balance")),
    );

    if (balanceResult.isErr()) {
      return c.json({ error: balanceResult.error.message }, 500);
    }

    return c.json({
      sponsor,
      network,
      balance: balanceResult.value.totalBalance,
      balanceSui: Number(balanceResult.value.totalBalance) / 1_000_000_000,
    });
  });
