/**
 * Self Sponsored Transaction Routes (No Enoki)
 *
 * Backend pays gas using its own keypair.
 *
 * POST /api/tx/self - Create & sponsor transaction with backend keypair
 * PUT  /api/tx/self - Execute with user signature + backend gas signature
 *
 * Flow:
 * 1. Client builds transaction (onlyTransactionKind: true)
 * 2. POST: Backend creates full transaction with gas payment from sponsor keypair
 * 3. Client signs the transaction
 * 4. PUT: Backend adds sponsor signature and submits to network
 */

import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import consola from "consola";
import { Hono } from "hono";
import { err, ok, type Result, ResultAsync } from "neverthrow";

import { serverEnv } from "@/env/server";
import { type NetworkName } from "@/networkConstants";

// In-memory store for pending transactions (production: use Redis or DB)
const pendingTransactions = new Map<
  string,
  {
    txBytes: string;
    sender: string;
    sponsor: string;
    network: NetworkName;
    createdAt: number;
  }
>();

// Cleanup old pending transactions (older than 5 minutes)
function cleanupPendingTransactions() {
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  for (const [digest, tx] of pendingTransactions) {
    if (tx.createdAt < fiveMinutesAgo) {
      pendingTransactions.delete(digest);
    }
  }
}

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
  // POST /api/tx/self - Create sponsored transaction
  .post("/", async (c) => {
    cleanupPendingTransactions();

    const parseResult = await ResultAsync.fromPromise(
      c.req.json() as Promise<{
        transactionKindBytes?: string;
        sender?: string;
        network?: string;
      }>,
      () => new Error("Invalid JSON body"),
    ).andThen(({ transactionKindBytes, sender, network = "testnet" }) => {
      if (!transactionKindBytes) {
        return err(new Error("Missing transactionKindBytes"));
      }

      if (!sender) {
        return err(new Error("Missing sender"));
      }

      const normalized = normalizeNetwork(network);

      consola.info("[Self-Sponsor] Creating transaction", {
        sender,
        network: normalized,
      });

      return ok({ transactionKindBytes, sender, network: normalized });
    });

    if (parseResult.isErr()) {
      const status = parseResult.error.message.includes("Missing") ? 400 : 500;
      return c.json({ error: parseResult.error.message }, status);
    }

    const { transactionKindBytes, sender, network } = parseResult.value;

    const keypairResult = getSponsorKeypair();
    if (keypairResult.isErr()) {
      return c.json({ error: keypairResult.error.message }, 500);
    }

    const sponsorKeypair = keypairResult.value;
    const sponsor = sponsorKeypair.toSuiAddress();
    const suiClient = getSuiClient(network);

    // Get gas coins from sponsor
    const coinsResult = await ResultAsync.fromPromise(
      suiClient.getCoins({
        owner: sponsor,
        coinType: "0x2::sui::SUI",
      }),
      (e) => (e instanceof Error ? e : new Error("Failed to get coins")),
    );

    if (coinsResult.isErr()) {
      consola.error("[Self-Sponsor] Failed to get coins", { error: coinsResult.error.message });
      return c.json({ error: coinsResult.error.message }, 500);
    }

    if (coinsResult.value.data.length === 0) {
      return c.json({ error: "Sponsor has no SUI for gas" }, 500);
    }

    // Build full transaction with sponsor as gas payer
    const tx = Transaction.fromKind(transactionKindBytes);
    tx.setSender(sender);
    tx.setGasOwner(sponsor);

    // Use first available coin for gas
    tx.setGasPayment(
      coinsResult.value.data.slice(0, 1).map((coin) => ({
        objectId: coin.coinObjectId,
        version: coin.version,
        digest: coin.digest,
      })),
    );

    // Build the transaction
    const buildResult = await ResultAsync.fromPromise(tx.build({ client: suiClient }), (e) =>
      e instanceof Error ? e : new Error("Failed to build transaction"),
    );

    if (buildResult.isErr()) {
      consola.error("[Self-Sponsor] Failed to build transaction", {
        error: buildResult.error.message,
      });
      return c.json({ error: buildResult.error.message }, 500);
    }

    const txBytesBase64 = Buffer.from(buildResult.value).toString("base64");

    // Generate a digest for tracking
    const digest = `self-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    // Store for later execution
    pendingTransactions.set(digest, {
      txBytes: txBytesBase64,
      sender,
      sponsor,
      network,
      createdAt: Date.now(),
    });

    consola.success("[Self-Sponsor] Transaction prepared", {
      digest,
      sender,
      sponsor,
    });

    return c.json({
      bytes: txBytesBase64,
      digest,
      sponsor,
    });
  })
  // PUT /api/tx/self - Execute sponsored transaction
  .put("/", async (c) => {
    const parseResult = await ResultAsync.fromPromise(
      c.req.json() as Promise<{
        digest?: string;
        signature?: string;
      }>,
      () => new Error("Invalid JSON body"),
    ).andThen(({ digest, signature }) => {
      if (!digest) {
        return err(new Error("Missing transaction digest"));
      }

      if (!signature) {
        return err(new Error("Missing user signature"));
      }

      return ok({ digest, signature });
    });

    if (parseResult.isErr()) {
      const status = parseResult.error.message.includes("Missing") ? 400 : 500;
      return c.json({ error: parseResult.error.message }, status);
    }

    const { digest, signature: userSignature } = parseResult.value;

    // Get pending transaction
    const pending = pendingTransactions.get(digest);
    if (!pending) {
      return c.json({ error: "Transaction not found or expired" }, 404);
    }

    const keypairResult = getSponsorKeypair();
    if (keypairResult.isErr()) {
      return c.json({ error: keypairResult.error.message }, 500);
    }

    const sponsorKeypair = keypairResult.value;
    const suiClient = getSuiClient(pending.network);

    // Decode transaction bytes
    const txBytes = Buffer.from(pending.txBytes, "base64");

    // Sign with sponsor keypair
    const signResult = await ResultAsync.fromPromise(
      sponsorKeypair.signTransaction(txBytes),
      (e) => (e instanceof Error ? e : new Error("Failed to sign transaction")),
    );

    if (signResult.isErr()) {
      consola.error("[Self-Sponsor] Failed to sign transaction", {
        error: signResult.error.message,
      });
      return c.json({ error: signResult.error.message }, 500);
    }

    const sponsorSignature = signResult.value.signature;

    // Execute with both signatures
    const executeResult = await ResultAsync.fromPromise(
      suiClient.executeTransactionBlock({
        transactionBlock: pending.txBytes,
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
      consola.error("[Self-Sponsor] Failed to execute transaction", {
        error: executeResult.error.message,
      });
      return c.json({ error: executeResult.error.message }, 500);
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
      consola.error("[Self-Sponsor] Failed to wait for transaction", {
        error: waitResult.error.message,
      });
      return c.json({ error: waitResult.error.message }, 500);
    }

    // Cleanup
    pendingTransactions.delete(digest);

    consola.success("[Self-Sponsor] Transaction executed", {
      digest: waitResult.value.digest,
      success: waitResult.value.effects?.status?.status === "success",
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
