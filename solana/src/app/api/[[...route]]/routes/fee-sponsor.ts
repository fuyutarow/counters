/**
 * Fee Sponsor Transaction Routes (1RT - Backend Fee Payer)
 *
 * Backend pays transaction fees using its own keypair.
 *
 * GET  /api/tx/sponsor/info - Get sponsor public key and balance
 * POST /api/tx/sponsor/execute - Execute transaction with fee payer signature (1RT)
 *
 * Flow:
 * 1. Client gets sponsor pubkey via /info
 * 2. Client builds tx with feePayer = sponsor pubkey
 * 3. Client signs with user wallet (partial sign)
 * 4. Client calls /execute with serialized tx + user signature (1RT!)
 */

import * as anchor from "@coral-xyz/anchor";
import { Connection, clusterApiUrl, Keypair, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import consola from "consola";
import { Hono } from "hono";
import { err, ok, Result, ResultAsync } from "neverthrow";

import { serverEnv } from "@/env/server";

// Program IDs for validation
const ALLOWED_PROGRAM_IDS = [
  "GPmMruCgQL4HLkt4KDzSRd4KrZ3uRBa3mCzxdtLuAaeY", // shared_counter
  "8YtCv2Y9U4Y4q7F4yVrYPjvLLwvmyKuHqN3v6kLvGBJd", // owned_counter (if exists)
  "11111111111111111111111111111111", // System Program
];

type Network = "devnet" | "mainnet-beta" | "testnet";

function normalizeNetwork(network: string): Network {
  if (network === "devnet" || network === "mainnet-beta" || network === "testnet") {
    return network;
  }
  return "devnet";
}

function getSponsorKeypair(): Result<Keypair, Error> {
  const privateKey = serverEnv.SPONSOR_PRIVATE_KEY;
  if (!privateKey) {
    return err(new Error("SPONSOR_PRIVATE_KEY is not configured"));
  }

  // Decode base58 private key
  const secretKey = bs58.decode(privateKey);
  return ok(Keypair.fromSecretKey(secretKey));
}

function getConnection(network: Network): Connection {
  return new Connection(clusterApiUrl(network), "confirmed");
}

/**
 * Validate that transaction only calls allowed programs
 */
function validateTransactionPrograms(
  tx: VersionedTransaction,
  allowedProgramIds: string[],
): Result<undefined, string> {
  const message = tx.message;
  const accountKeys = message.staticAccountKeys;

  // Get program IDs from instructions
  for (const instruction of message.compiledInstructions) {
    const programAccount = accountKeys[instruction.programIdIndex];
    if (!programAccount) {
      return err(`Invalid program index: ${instruction.programIdIndex}`);
    }
    const programId = programAccount.toBase58();
    if (!allowedProgramIds.includes(programId)) {
      return err(`Unauthorized program: ${programId}. Allowed: ${allowedProgramIds.join(", ")}`);
    }
  }

  return ok(undefined);
}

export const feeSponsorRoutes = new Hono()
  // GET /api/tx/sponsor/info - Get sponsor info
  .get("/info", async (c) => {
    const network = normalizeNetwork(c.req.query("network") ?? "devnet");

    const keypairResult = getSponsorKeypair();
    if (keypairResult.isErr()) {
      return c.json({ error: keypairResult.error.message }, 500);
    }

    const sponsor = keypairResult.value.publicKey;
    const connection = getConnection(network);

    const balanceResult = await ResultAsync.fromPromise(connection.getBalance(sponsor), (e) =>
      e instanceof Error ? e : new Error("Failed to get balance"),
    );

    if (balanceResult.isErr()) {
      return c.json({ error: balanceResult.error.message }, 500);
    }

    return c.json({
      sponsor: sponsor.toBase58(),
      network,
      balance: balanceResult.value,
      balanceSol: balanceResult.value / anchor.web3.LAMPORTS_PER_SOL,
    });
  })
  // POST /api/tx/sponsor/execute - Execute transaction with fee payer (1RT)
  .post("/execute", async (c) => {
    const parseResult = await ResultAsync.fromPromise(
      c.req.json() as Promise<{
        txBytes?: string; // base64 encoded serialized transaction
        network?: string;
      }>,
      () => new Error("Invalid JSON body"),
    ).andThen(({ txBytes, network = "devnet" }) => {
      if (!txBytes) {
        return err(new Error("Missing txBytes"));
      }
      return ok({ txBytes, network: normalizeNetwork(network) });
    });

    if (parseResult.isErr()) {
      return c.json({ error: parseResult.error.message }, 400);
    }

    const { txBytes, network } = parseResult.value;

    const keypairResult = getSponsorKeypair();
    if (keypairResult.isErr()) {
      return c.json({ error: keypairResult.error.message }, 500);
    }

    const sponsorKeypair = keypairResult.value;
    const connection = getConnection(network);

    const totalStart = performance.now();

    // Step 1: Deserialize transaction
    const deserializeStart = performance.now();
    const txBuffer = Buffer.from(txBytes, "base64");
    const deserializeResult = Result.fromThrowable(
      () => VersionedTransaction.deserialize(txBuffer),
      (e) =>
        `Failed to deserialize transaction: ${e instanceof Error ? e.message : "Unknown error"}`,
    )();

    if (deserializeResult.isErr()) {
      return c.json({ error: deserializeResult.error }, 400);
    }
    const tx = deserializeResult.value;
    const deserializeTime = performance.now() - deserializeStart;

    // Step 2: Validate transaction programs
    const validationResult = validateTransactionPrograms(tx, ALLOWED_PROGRAM_IDS);
    if (validationResult.isErr()) {
      consola.warn("[Fee-Sponsor] Transaction validation failed", {
        error: validationResult.error,
      });
      return c.json({ error: validationResult.error }, 403);
    }

    // Step 3: Verify fee payer matches sponsor
    const feePayer = tx.message.staticAccountKeys[0];
    if (!feePayer) {
      return c.json({ error: "Transaction has no fee payer" }, 400);
    }
    if (!feePayer.equals(sponsorKeypair.publicKey)) {
      return c.json(
        {
          error: `Fee payer mismatch. Expected: ${sponsorKeypair.publicKey.toBase58()}, Got: ${feePayer.toBase58()}`,
        },
        400,
      );
    }

    consola.info("[Fee-Sponsor] Execute sponsored transaction", {
      feePayer: feePayer.toBase58(),
      numSignatures: tx.signatures.length,
      network,
    });

    // Step 4: Sign with sponsor keypair
    const signStart = performance.now();
    tx.sign([sponsorKeypair]);
    const signTime = performance.now() - signStart;
    consola.info(`[Fee-Sponsor] 1. Sign tx: ${signTime.toFixed(0)}ms`);

    // Step 5: Send transaction
    const sendStart = performance.now();
    const sendResult = await ResultAsync.fromPromise(
      connection.sendTransaction(tx, {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      }),
      (e) => (e instanceof Error ? e : new Error("Failed to send transaction")),
    );

    if (sendResult.isErr()) {
      consola.error("[Fee-Sponsor] Failed to send transaction", {
        error: sendResult.error.message,
      });
      return c.json({ error: sendResult.error.message }, 500);
    }
    const sendTime = performance.now() - sendStart;
    consola.info(`[Fee-Sponsor] 2. Send tx: ${sendTime.toFixed(0)}ms`);

    const signature = sendResult.value;

    // Step 6: Confirm transaction
    const confirmStart = performance.now();
    const confirmResult = await ResultAsync.fromPromise(
      connection.confirmTransaction(signature, "confirmed"),
      (e) => (e instanceof Error ? e : new Error("Failed to confirm transaction")),
    );

    if (confirmResult.isErr()) {
      consola.error("[Fee-Sponsor] Failed to confirm transaction", {
        error: confirmResult.error.message,
      });
      return c.json({ error: confirmResult.error.message, signature }, 500);
    }
    const confirmTime = performance.now() - confirmStart;
    consola.info(`[Fee-Sponsor] 3. Confirm tx: ${confirmTime.toFixed(0)}ms`);

    const totalTime = performance.now() - totalStart;

    consola.box(
      `┌─ Fee-Sponsor Backend (1RT) ──────────────────┐
│                                              │
│  1. Deserialize:            ${deserializeTime.toFixed(0).padStart(5)}ms            │
│  2. Sign (sponsor):         ${signTime.toFixed(0).padStart(5)}ms            │
│  3. Send tx:                ${sendTime.toFixed(0).padStart(5)}ms            │
│  4. Confirm tx:             ${confirmTime.toFixed(0).padStart(5)}ms            │
│                                              │
├──────────────────────────────────────────────┤
│  Total backend time:        ${totalTime.toFixed(0).padStart(5)}ms            │
└──────────────────────────────────────────────┘`,
    );

    consola.success("[Fee-Sponsor] Sponsored transaction executed (1RT)", {
      signature,
      success: !confirmResult.value.value?.err,
    });

    return c.json({
      signature,
      success: !confirmResult.value.value?.err,
    });
  })
  // GET /api/tx/sponsor/balance - Check sponsor balance
  .get("/balance", async (c) => {
    const network = normalizeNetwork(c.req.query("network") ?? "devnet");

    const keypairResult = getSponsorKeypair();
    if (keypairResult.isErr()) {
      return c.json({ error: keypairResult.error.message }, 500);
    }

    const sponsor = keypairResult.value.publicKey;
    const connection = getConnection(network);

    const balanceResult = await ResultAsync.fromPromise(connection.getBalance(sponsor), (e) =>
      e instanceof Error ? e : new Error("Failed to get balance"),
    );

    if (balanceResult.isErr()) {
      return c.json({ error: balanceResult.error.message }, 500);
    }

    return c.json({
      sponsor: sponsor.toBase58(),
      network,
      balance: balanceResult.value,
      balanceSol: balanceResult.value / anchor.web3.LAMPORTS_PER_SOL,
    });
  });
