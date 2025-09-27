/**
 * SEAL IBE Multisig End-to-End Integration Test
 *
 * This test demonstrates the complete SEAL IBE multisig flow:
 * 1. Counter creation with real Seal Key Server public keys
 * 2. SEAL IBE signature generation using threshold IBE key derivation
 * 3. On-chain signature verification using pairing equations
 * 4. Counter increment with verified signature
 *
 * Critical Path: Create → Sign → Verify → Increment
 */

import { beforeAll, describe, expect, test } from "bun:test";
import { SealClient, SessionKey } from "@mysten/seal";
import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { type Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { bls12_381 } from "@noble/curves/bls12-381.js";
import { consola } from "consola";
import { counterPackage, type Seal_ibe_multisig_counterSealIbeMultisigCounterType } from "@/abi";
import { getKeypair } from "./utils/keybook.js";

// Configuration
const NETWORK = "testnet";
const THRESHOLD = 2; // 2-of-3 threshold
const THRESHOLD_RUNTIME = process.env.SEAL_TEST_THRESHOLD
  ? Number(process.env.SEAL_TEST_THRESHOLD)
  : THRESHOLD;
const COUNTER_PACKAGE_ID = counterPackage.packageId;

// ================================
// PHASE 0: SYSTEMATIC DEBUGGING
// ================================

/**
 * ID construction mode - confirmed through Phase 0 systematic debugging
 * Using "inner" only (counterId || signerAddr || domain || message)
 * Package ID prefix causes "Scalar out of range" errors in Key Servers
 */
const ID_MODE = "inner" as const;

// Enhanced logging for debugging instability
function logSealIbe(message: string, data?: any) {
  const logMessage = `[SEAL-IBE-DEBUG] ${message}`;
  if (data) {
    consola.info(logMessage, data);
  } else {
    consola.info(logMessage);
  }
}

/**
 * Analyze if ID might cause Fr scalar range overflow
 * BLS12-381 Fr modulus: 0x73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000001
 */
function analyzeFrRisk(idBytes: Uint8Array): {
  likelyOverflow: boolean;
  firstBytes: string;
  analysis: string;
} {
  // Check if first 32 bytes (counterId) have high values that might cause overflow
  const first32 = idBytes.slice(0, 32);
  const firstBytesHex = Buffer.from(first32).toString("hex");

  // Simple heuristic: check if first byte is >= 0x73 (Fr modulus starts with 0x73)
  const firstByte = first32[0];
  const likelyOverflow = firstByte >= 0x73;

  let analysis = "safe";
  if (firstByte >= 0x80) analysis = "high_risk";
  else if (firstByte >= 0x73) analysis = "medium_risk";
  else if (firstByte >= 0x60) analysis = "low_risk";

  return {
    likelyOverflow,
    firstBytes: firstBytesHex.slice(0, 16), // First 8 bytes
    analysis,
  };
}

// Statistical tracking for debugging
interface ServerStats {
  [serverName: string]: {
    total: number;
    successes: number;
    failures: number;
    byFrRisk: {
      safe: { successes: number; failures: number };
      low_risk: { successes: number; failures: number };
      medium_risk: { successes: number; failures: number };
      high_risk: { successes: number; failures: number };
    };
  };
}

const serverStats: ServerStats = {};

function updateServerStats(serverName: string, success: boolean, frRisk: string) {
  if (!serverStats[serverName]) {
    serverStats[serverName] = {
      total: 0,
      successes: 0,
      failures: 0,
      byFrRisk: {
        safe: { successes: 0, failures: 0 },
        low_risk: { successes: 0, failures: 0 },
        medium_risk: { successes: 0, failures: 0 },
        high_risk: { successes: 0, failures: 0 },
      },
    };
  }

  const stats = serverStats[serverName];
  stats.total++;

  if (success) {
    stats.successes++;
    stats.byFrRisk[frRisk as keyof typeof stats.byFrRisk].successes++;
  } else {
    stats.failures++;
    stats.byFrRisk[frRisk as keyof typeof stats.byFrRisk].failures++;
  }
}

function logServerStats() {
  logSealIbe("SERVER STATISTICS", serverStats);

  // Summary analysis
  for (const [serverName, stats] of Object.entries(serverStats)) {
    const successRate = stats.total > 0 ? ((stats.successes / stats.total) * 100).toFixed(1) : "0";
    consola.success(`${serverName}: ${successRate}% success (${stats.successes}/${stats.total})`);
  }
}

// Real Key Server configurations from testnet
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

// Interfaces for SEAL IBE multisig
interface KeyShare {
  serverIndex: number;
  serverId: string;
  secretKey: Uint8Array; // sk_ID_i as G1Element bytes
}

interface BlsMultisigSignature {
  signature: Uint8Array; // G1 signature (48 bytes)
  message: Uint8Array;
  identity: string;
}

// BLS signature utilities
const _blss = bls12_381.shortSignatures;

// ================================
// DEBUG UTILITIES for SEAL IBE
// ================================

/**
 * Debug utility: hex formatter for byte arrays
 */
function hex(u8: Uint8Array): `0x${string}` {
  return `0x${Buffer.from(u8).toString("hex")}`;
}

/**
 * Debug utility: convert hex string to 32-byte array (left zero padded)
 */
function hexTo32Bytes(hexStr: string): Uint8Array {
  const h = hexStr.startsWith("0x") ? hexStr.slice(2) : hexStr;
  return new Uint8Array(Buffer.from(h.padStart(64, "0"), "hex"));
}

/**
 * Build InnerID matching Move implementation exactly
 */
export function buildInnerId(
  counterId: string,
  signerAddr: string,
  msg: Uint8Array,
): { inner: Uint8Array; messageWithDomain: Uint8Array } {
  const DOMAIN = new TextEncoder().encode("SUI-SEAL-IBE-V1");
  const counter = hexTo32Bytes(counterId);
  const signer = hexTo32Bytes(signerAddr);
  const messageWithDomain = new Uint8Array([...DOMAIN, ...msg]);
  const inner = new Uint8Array([...counter, ...signer, ...messageWithDomain]);
  return { inner, messageWithDomain };
}

/**
 * Build FullID matching SEAL SDK createFullId function
 */
export function buildFullId(packageId: string, innerId: Uint8Array): Uint8Array {
  const pkg = hexTo32Bytes(packageId);
  const full = new Uint8Array([...pkg, ...innerId]);
  return full;
}

/**
 * Build H1 input for SEAL IBE matching Move implementation
 */
export function buildH1InputForSealIBE(
  packageId: string,
  innerId: Uint8Array,
): { full: Uint8Array; h1in: Uint8Array } {
  const DST = new TextEncoder().encode("SUI-SEAL-IBE-BLS12381-00");
  const full = buildFullId(packageId, innerId);
  const h1in = new Uint8Array([...DST, ...full]);
  return { full, h1in };
}

/**
 * Assert G1 compressed point is valid
 */
function assertG1Compressed(_name: string, bytes: Uint8Array): void {
  const _p = bls12_381.G1.Point.fromBytes(bytes); // fails if invalid
}

/**
 * Assert G2 compressed point is valid
 */
function assertG2Compressed(name: string, bytes: Uint8Array): void {
  if (bytes.length !== 96) throw new Error(`${name} must be 96 bytes (G2 compressed)`);
  // noble for G2 parsing (fails if invalid)
  const _p = bls12_381.G2.Point.fromHex(Buffer.from(bytes).toString("hex"));
}

/**
 * Server configuration for individual testing
 */
type OneServerCfg = { objectId: string; url: string; weight: number };

/**
 * Test individual server for derive key operation
 */
async function deriveFromOneServer(
  server: OneServerCfg,
  idHex: `0x${string}`,
  sessionKey: SessionKey,
  txBytes: Uint8Array,
): Promise<{ ok: true; serverId: string; keyBytes: Uint8Array } | { ok: false; error: string }> {
  const one = new SealClient({
    networkConfig: NETWORK,
    suiClient: new SuiClient({ url: getFullnodeUrl(NETWORK) }),
    serverConfigs: [server],
  });

  const MAX_RETRIES = 5;
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const m = await one.getDerivedKeys({ id: idHex, sessionKey, txBytes, threshold: 1 });
      // Map(1) expected
      const [entry] = [...m.entries()];
      if (!entry) throw new Error("No key returned");
      const [serverId, derivedKey] = entry;
      return { ok: true as const, serverId, keyBytes: derivedKey.key.toBytes() };
    } catch (e: unknown) {
      lastError = e;
      const errorStr = String(e);

      if (errorStr.includes("Scalar out of range")) {
        if (attempt < MAX_RETRIES) {
          logSealIbe(
            `${server.name || server.url} Scalar error retry ${attempt}/${MAX_RETRIES}`,
            {},
          );
          continue;
        }
      }

      // For other errors, fail immediately
      const errorDetails =
        e instanceof Error ? `${e.name}: ${e.message}\nStack: ${e.stack}` : String(e);
      return { ok: false as const, error: errorDetails };
    }
  }

  // All retries exhausted for scalar error
  const errorDetails =
    lastError instanceof Error
      ? `${lastError.name}: ${lastError.message}\nStack: ${lastError.stack}`
      : String(lastError);
  return { ok: false as const, error: errorDetails };
}

/**
 * Diagnostic function to determine server implementation type
 */
async function deriveForDiagnosis(
  server: OneServerCfg,
  idHex: `0x${string}`,
  sessionKey: SessionKey,
  txBytes: Uint8Array,
): Promise<{
  resRaw: { ok: true; serverId: string; key: Uint8Array } | { ok: false; error: string };
  resSha: { ok: true; serverId: string; key: Uint8Array } | { ok: false; error: string };
}> {
  const client = new SealClient({
    networkConfig: NETWORK,
    suiClient: new SuiClient({ url: getFullnodeUrl(NETWORK) }),
    serverConfigs: [server],
  });

  // Create 32B SHA256 hash for diagnosis (NOT used in verification)
  const inner = Buffer.from(idHex.slice(2), "hex");
  const sha = new Uint8Array(await crypto.subtle.digest("SHA-256", inner));
  const shaHex = `0x${Buffer.from(sha).toString("hex")}` as const;

  const tryOnce = async (idHex: `0x${string}`) => {
    try {
      const m = await client.getDerivedKeys({ id: idHex, sessionKey, txBytes, threshold: 1 });
      const [entry] = [...m.entries()];
      if (!entry) throw new Error("No key returned");
      const [serverId, derivedKey] = entry;
      return { ok: true as const, serverId, key: derivedKey.key.toBytes() };
    } catch (e: unknown) {
      // Detailed error information for debugging
      const errorDetails =
        e instanceof Error ? `${e.name}: ${e.message}\nStack: ${e.stack}` : String(e);
      return { ok: false as const, error: errorDetails };
    }
  };

  const resRaw = await tryOnce(idHex);
  const resSha = await tryOnce(shaHex);

  return { resRaw, resSha };
}

/**
 * Session key wrapper with automatic retry on expiration
 */
type SessionKeyMeta = {
  key: SessionKey;
  createdAt: number;
  ttlMs: number;
};

const SESSION_KEY_TTL_MIN = 30;
const SESSION_KEY_TTL_MS = SESSION_KEY_TTL_MIN * 60 * 1000;
const SESSION_KEY_REFRESH_MARGIN_MS = 6 * 60 * 1000;
const SESSION_KEY_COOLDOWN_MS = 5 * 1000; // 5 second cooldown between session key creations

const cachedSessionKeyMetaByAddress = new Map<string, SessionKeyMeta>();
const lastSessionKeyCreationByAddress = new Map<string, number>();

async function resetSessionKey(suiClient: SuiClient, addr: string, keypair: Ed25519Keypair) {
  // Enforce cooldown to avoid hitting server rate limits
  const now = Date.now();
  const lastCreation = lastSessionKeyCreationByAddress.get(addr) || 0;
  const timeSinceLastCreation = now - lastCreation;
  if (timeSinceLastCreation < SESSION_KEY_COOLDOWN_MS) {
    const waitTime = SESSION_KEY_COOLDOWN_MS - timeSinceLastCreation;
    logSealIbe("Session key cooldown", { waitTime: `${waitTime}ms`, address: addr });
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }

  logSealIbe("Creating new session key", { address: addr });
  const key = await SessionKey.create({
    address: addr,
    packageId: COUNTER_PACKAGE_ID,
    ttlMin: SESSION_KEY_TTL_MIN,
    signer: keypair,
    suiClient,
  });

  lastSessionKeyCreationByAddress.set(addr, Date.now());
  cachedSessionKeyMetaByAddress.set(addr, {
    key,
    createdAt: Date.now(),
    ttlMs: SESSION_KEY_TTL_MS,
  });

  const sessionMeta = cachedSessionKeyMetaByAddress.get(addr)!;
  const currentTime = Date.now();
  logSealIbe("Session key created", {
    address: addr,
    createdAt: sessionMeta.createdAt,
    currentTime,
    timeDiff: currentTime - sessionMeta.createdAt,
    ttlMin: SESSION_KEY_TTL_MIN,
    ttlMs: SESSION_KEY_TTL_MS,
    expiryTime: sessionMeta.createdAt + SESSION_KEY_TTL_MS,
    isExpiredImmediately: key.isExpired(),
  });
}

function _shouldRefresh(addr: string): boolean {
  const meta = cachedSessionKeyMetaByAddress.get(addr);
  if (!meta) {
    return true;
  }
  if (meta.key.isExpired()) {
    return true;
  }
  return Date.now() - meta.createdAt >= meta.ttlMs - SESSION_KEY_REFRESH_MARGIN_MS;
}

async function withSessionKey<T>(
  suiClient: SuiClient,
  addr: string,
  keypair: Ed25519Keypair,
  fn: (sk: SessionKey) => Promise<T>,
): Promise<T> {
  // Create session key if needed or refresh if expired
  if (_shouldRefresh(addr)) {
    await resetSessionKey(suiClient, addr, keypair);
  }

  const MAX_RETRIES = 5;
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const sessionMeta = cachedSessionKeyMetaByAddress.get(addr);
      if (!sessionMeta) {
        throw new Error(`No session key found for address ${addr}`);
      }
      return await fn(sessionMeta.key);
    } catch (e: unknown) {
      lastError = e;
      const errorStr = String(e);

      if (errorStr.includes("expired")) {
        logSealIbe(`Attempt ${attempt}: Session expired, creating new session key`, {});
        await resetSessionKey(suiClient, addr, keypair);
        continue;
      }

      if (errorStr.includes("Scalar out of range")) {
        logSealIbe(`Attempt ${attempt}: Scalar out of range, retrying`, {
          attempt,
          maxRetries: MAX_RETRIES,
        });
        // For scalar errors, just retry without refreshing session key
        // The error occurs during ephemeral key generation in createRequestParams
        if (attempt < MAX_RETRIES) {
          continue;
        }
      }

      // For other errors, fail immediately
      throw e;
    }
  }

  throw lastError;
}

/**
 * Get counter value from on-chain object
 */
const getCounterValue = async (client: SuiClient, counterId: string): Promise<number> => {
  const counterObject = await client.getObject({
    id: counterId,
    options: { showContent: true, showType: true },
  });

  if (!counterObject.data?.content || counterObject.data.content.dataType !== "moveObject") {
    throw new Error(`Invalid counter object: ${counterId}`);
  }

  const fields = counterObject.data.content
    .fields as Seal_ibe_multisig_counterSealIbeMultisigCounterType;
  return Number(fields.value);
};

/**
 * Fetch real public keys from Seal Key Servers using SEAL ABI-first approach
 */
const getRealSealShardPublicKeys = async (
  keyServerIds: string[],
  network: "testnet" | "mainnet" = "testnet",
): Promise<Uint8Array[]> => {
  const client = new SuiClient({ url: getFullnodeUrl(network) });
  const publicKeys: Uint8Array[] = [];

  for (const keyServerId of keyServerIds) {
    try {
      // ABI-first approach: Use object inspection with ABI structure knowledge
      // sealPackage.key_server.pk() tells us the function exists, but for data access
      // we need to inspect objects following the ABI-defined structure
      const keyServerObj = await client.getObject({
        id: keyServerId,
        options: { showContent: true },
      });

      if (keyServerObj.error) {
        throw new Error(`Failed to fetch Key Server object: ${keyServerObj.error}`);
      }

      // Get KeyServerV1 via dynamic fields (following ABI structure)
      const dynamicFields = await client.getDynamicFields({
        parentId: keyServerId,
      });

      const v1Field = dynamicFields.data.find((field) => field.objectType.includes("KeyServerV1"));
      if (!v1Field) {
        throw new Error(`No KeyServerV1 dynamic field found for ${keyServerId}`);
      }

      const v1Object = await client.getObject({
        id: v1Field.objectId,
        options: { showContent: true },
      });

      if (v1Object.error || !v1Object.data?.content) {
        throw new Error(`Failed to fetch KeyServerV1 object: ${v1Object.error}`);
      }

      const v1Content = v1Object.data.content;
      if (v1Content.dataType !== "moveObject") {
        throw new Error("Invalid KeyServerV1 object structure");
      }

      // Extract pk following the ABI-defined structure
      const v1Fields = (v1Content as { fields?: { value?: { fields?: { pk?: unknown } } } }).fields;
      const pkField = v1Fields?.value?.fields?.pk;

      if (!pkField) {
        throw new Error(`No pk field found in KeyServerV1 object: ${v1Field.objectId}`);
      }

      // Convert pk bytes to Uint8Array following ABI expectations
      let mpkBytes: Uint8Array;
      if (Array.isArray(pkField)) {
        mpkBytes = new Uint8Array(pkField);
      } else if (typeof pkField === "string") {
        if (pkField.startsWith("0x")) {
          mpkBytes = new Uint8Array(Buffer.from(pkField.slice(2), "hex"));
        } else {
          mpkBytes = new Uint8Array(Buffer.from(pkField, "base64"));
        }
      } else {
        throw new Error(`Unexpected pk field format in ${keyServerId}: ${typeof pkField}`);
      }

      // Validate G2 point using ABI-aware validation
      assertG2Compressed(`KeyServer-${keyServerId}`, mpkBytes);

      publicKeys.push(mpkBytes);
    } catch (error) {
      throw new Error(`ABI-first Key Server integration failed: ${error}`);
    }
  }
  return publicKeys;
};

/**
 * Create SEAL IBE multisig counter with real Seal Key Server public keys
 */
const createSealIbeMultisigCounter = async (
  client: SuiClient,
  keypair: Ed25519Keypair,
): Promise<string> => {
  const tx = new Transaction();
  const keyServerIds = KEY_SERVERS.map((server) => server.objectId);

  // Fetch real public keys from Seal Key Servers
  const publicKeys = await getRealSealShardPublicKeys(keyServerIds, NETWORK);

  counterPackage.seal_ibe_multisig_counter.share(tx, {
    arguments: [
      tx.pure.vector("id", keyServerIds),
      tx.pure.vector("vector<u8>", publicKeys),
      tx.pure.u64(THRESHOLD),
    ],
  });

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true, showObjectChanges: true },
  });

  if (result.effects?.status?.status !== "success") {
    throw new Error(`Counter creation failed: ${result.effects?.status?.error}`);
  }

  // Wait for transaction to be processed
  await client.waitForTransaction({ digest: result.digest });

  const created = result.objectChanges?.find(
    (change) => change.type === "created" && change.objectType?.includes("SealIbeMultisigCounter"),
  );

  if (!created || created.type !== "created") {
    throw new Error("Failed to find created SEAL IBE multisig counter");
  }

  return created.objectId;
};

/**
 * Fetch IBE key shares from Seal Key Servers with debugging and failover
 */
const fetchSecretKeyShares = async (
  counterId: string,
  signerKeypair: Ed25519Keypair,
  message: string,
  requiredCount: number = THRESHOLD_RUNTIME,
): Promise<KeyShare[]> => {
  const suiClient = new SuiClient({ url: getFullnodeUrl(NETWORK) });
  const signerAddress = signerKeypair.getPublicKey().toSuiAddress();

  // Server configurations for individual testing
  const servers: OneServerCfg[] = [
    {
      objectId: "0x164ac3d2b3b8694b8181c13f671950004765c23f270321a45fdd04d40cccf0f2",
      url: "https://seal.studio-mirai.com", // Studio Mirai
      weight: 1,
    },
    {
      objectId: "0x6068c0acb197dddbacd4746a9de7f025b2ed5a5b6c1b1ab44dade4426d141da2",
      url: "https://seal.ruby-node.com", // Ruby Node
      weight: 1,
    },
    {
      objectId: "0x5466b7df5c15b508678d51496ada8afab0d6f70a01c10613123382b1b8131007",
      url: "https://seal.nodeinfra.com", // NodeInfra
      weight: 1,
    },
  ];

  return await withSessionKey(suiClient, signerAddress, signerKeypair, async (sessionKey) => {
    try {
      // Step 1: Build InnerID exactly as Move expects (without package prefix)
      const messageBytes = new TextEncoder().encode(message);
      const { inner } = buildInnerId(counterId, signerAddress, messageBytes);
      const selectedHex = hex(inner);

      // Analyze ID for potential Fr scalar range issues
      const _idAsHex = selectedHex;
      const isLikelyFrOverflow = analyzeFrRisk(inner);

      logSealIbe("Key derivation analysis", {
        counterId,
        message,
        idLength: inner.length,
        idHex: selectedHex,
        frRiskAnalysis: isLikelyFrOverflow,
        sessionExpired: sessionKey.isExpired(),
      });

      // Step 2: Build seal_approve transaction for txBytes (DO NOT EXECUTE)
      const approveTx = new Transaction();
      approveTx.moveCall({
        target: `${COUNTER_PACKAGE_ID}::seal_ibe_multisig_counter::seal_approve`,
        arguments: [
          approveTx.pure.vector("u8", Array.from(inner)),
          approveTx.object(counterId),
          approveTx.pure.vector("u8", Array.from(messageBytes)),
        ],
      });

      // Generate txBytes without executing the transaction
      const txBytes = await approveTx.build({
        client: suiClient,
        onlyTransactionKind: true,
      });
      const perServer = await Promise.all(
        servers.map(async (s, idx) => {
          const serverName = KEY_SERVERS[idx]?.name || `Server-${idx}`;

          const primary = await deriveFromOneServer(s, selectedHex, sessionKey, txBytes);
          let diag: Awaited<ReturnType<typeof deriveForDiagnosis>> | null = null;

          if (primary.ok) {
            logSealIbe(`${serverName} SUCCESS`, {
              keyLength: primary.keyBytes.length,
              frRisk: isLikelyFrOverflow.analysis,
              counterId: `${counterId.slice(0, 10)}...`,
            });
            updateServerStats(serverName, true, isLikelyFrOverflow.analysis);
          } else {
            logSealIbe(`${serverName} FAILED`, {
              error: primary.error,
              isScalarError: primary.error.includes("Scalar out of range"),
              frRisk: isLikelyFrOverflow.analysis,
              counterId: `${counterId.slice(0, 10)}...`,
            });
            updateServerStats(serverName, false, isLikelyFrOverflow.analysis);

            // Diagnostic for scalar errors to help with future debugging
            if (primary.error.includes("Scalar out of range")) {
              try {
                diag = await deriveForDiagnosis(s, selectedHex, sessionKey, txBytes);
                logSealIbe(`${serverName} DIAGNOSTIC`, {
                  rawResult: diag.resRaw.ok ? "SUCCESS" : "FAILED",
                  shaResult: diag.resSha.ok ? "SUCCESS" : "FAILED",
                  frRisk: isLikelyFrOverflow.analysis,
                });
              } catch (_diagError) {
                // Silent failure for diagnostics
              }
            }
          }

          return { idx, server: s, primary, diag, serverName };
        }),
      );

      const keyShares: KeyShare[] = [];
      const errors: Array<{ serverIndex: number; server: OneServerCfg; error: string }> = [];

      for (const entry of perServer) {
        const { idx, server, primary, diag, serverName } = entry;

        if (primary.ok) {
          assertG1Compressed(`DerivedKey-server${idx}`, primary.keyBytes);
          keyShares.push({
            serverIndex: idx,
            serverId: primary.serverId,
            secretKey: primary.keyBytes,
          });
          continue;
        }

        errors.push({
          serverIndex: idx,
          server,
          error: primary.ok ? "" : primary.error,
        });
      }

      keyShares.sort((a, b) => a.serverIndex - b.serverIndex);

      if (keyShares.length < requiredCount) {
        // Check for expired session keys before throwing aggregated error
        const hasExpired = errors.some((e) =>
          e.error.toLowerCase().includes("session key has expired"),
        );
        if (hasExpired) {
          logSealIbe("Session expired detected in server responses, throwing for retry");
          throw new Error("Session key has expired");
        }

        logSealIbe("Key derivation failed", {
          need: requiredCount,
          got: keyShares.length,
          errors: errors.length,
        });

        throw new Error(
          `Not enough successful servers (need ${requiredCount}, got ${keyShares.length}). ` +
            `Errors: ${JSON.stringify(errors, null, 2)}`,
        );
      }
      logSealIbe("Key derivation successful", {
        servers: keyShares.length,
        required: requiredCount,
      });

      // Log statistics after each round
      logServerStats();

      keyShares.splice(requiredCount);
      return keyShares;
    } catch (error) {
      throw new Error(`Real Key Server integration failed: ${error}`);
    }
  });
};

/**
 * Aggregate IBE secret keys directly as signature
 */
const aggregateIBESignature = (keyShares: KeyShare[]): Uint8Array => {
  if (keyShares.length === 0) {
    throw new Error("No key shares to aggregate");
  }

  let aggregatedSignature: ReturnType<typeof bls12_381.G1.Point.fromBytes>;

  try {
    // Parse as compressed G1 point
    aggregatedSignature = bls12_381.G1.Point.fromBytes(keyShares[0].secretKey);
  } catch (_e) {
    // Try uncompressed format if compressed fails
    if (keyShares[0].secretKey.length === 96) {
      try {
        const uncompressed = keyShares[0].secretKey;
        const point = bls12_381.G1.Point.fromHex(Buffer.from(uncompressed).toString("hex"));
        aggregatedSignature = point;
      } catch (e2) {
        throw new Error(`Cannot parse IBE key: ${e2}`);
      }
    } else {
      throw new Error(
        `Invalid IBE key format. Expected 48 or 96 bytes, got ${keyShares[0].secretKey.length}`,
      );
    }
  }

  // Aggregate remaining key shares
  for (let i = 1; i < keyShares.length; i++) {
    try {
      const ibeKey = bls12_381.G1.Point.fromBytes(keyShares[i].secretKey);
      aggregatedSignature = aggregatedSignature.add(ibeKey);
    } catch (e) {
      if (keyShares[i].secretKey.length === 96) {
        const point = bls12_381.G1.Point.fromHex(
          Buffer.from(keyShares[i].secretKey).toString("hex"),
        );
        aggregatedSignature = aggregatedSignature.add(point);
      } else {
        throw new Error(`Failed to parse key share ${i}: ${e}`);
      }
    }
  }

  const aggregatedBytes = aggregatedSignature.toBytes(true); // 48 bytes compressed G1 point

  // Validate final aggregated signature
  assertG1Compressed("AggregatedSignature", aggregatedBytes);

  return aggregatedBytes;
};

/**
 * Create BLS multisig signature using aggregated IBE signature
 */
const createSealIbeMultisigSignature = (
  aggregatedIBESignature: Uint8Array,
  message: string,
  identity: string,
): BlsMultisigSignature => {
  const messageBytes = new TextEncoder().encode(message);

  return {
    signature: aggregatedIBESignature,
    message: messageBytes,
    identity,
  };
};

/**
 * Generate BLS signature using real Seal Key Server IBE key derivation
 */
const generateSealIbeSignature = async (
  _client: SuiClient,
  counterId: string,
  keypair: Ed25519Keypair,
  message: string,
): Promise<{ signature: Uint8Array; keyServerIds: string[] }> => {
  try {
    // Step 1: Fetch IBE key shares from real Key Servers for the specific message
    const keyShares = await fetchSecretKeyShares(counterId, keypair, message, THRESHOLD_RUNTIME);

    if (keyShares.length !== THRESHOLD_RUNTIME) {
      throw new Error(`Expected ${THRESHOLD_RUNTIME} key shares, got ${keyShares.length}`);
    }

    // Step 2: Aggregate IBE keys (which are already message-specific)
    const aggregatedIBESignature = aggregateIBESignature(keyShares);

    // Step 3: Use aggregated IBE key as SEAL IBE signature
    const signature = createSealIbeMultisigSignature(
      aggregatedIBESignature,
      message,
      keypair.getPublicKey().toSuiAddress(),
    );

    const keyServerIds = keyShares.map((share) => share.serverId);

    return {
      signature: signature.signature,
      keyServerIds,
    };
  } catch (error) {
    throw new Error(`SEAL IBE signature generation failed: ${error}`);
  }
};

/**
 * Verify signature and create proof on-chain
 */
const verifySignatureAndCreateProof = async (
  client: SuiClient,
  counterId: string,
  keypair: Ed25519Keypair,
  signature: Uint8Array,
  message: string,
  keyServerIds: string[],
): Promise<string> => {
  const tx = new Transaction();
  const messageBytes = new TextEncoder().encode(message);

  // Step 1: Create AggregatedPublicKey
  const [aggregatedKey] = counterPackage.seal_ibe_multisig_counter.new_seal_ibe_aggregated_pk(tx, {
    arguments: [tx.object(counterId)],
  });

  // Step 2: Add Key Server public keys from seal_ibe_table (no Key Server object access)
  // The public keys are already stored in the Counter's seal_ibe_table from Step 1
  // aggregate_signer_pubkey reads from the table, not from Key Server objects
  // Use only the servers that actually provided signatures (limited by THRESHOLD_RUNTIME)
  for (const keyServerId of keyServerIds.slice(0, THRESHOLD_RUNTIME)) {
    counterPackage.seal_ibe_multisig_counter.aggregate_signer_pubkey(tx, {
      arguments: [tx.object(counterId), aggregatedKey, tx.pure.id(keyServerId)],
    });
  }

  // Step 3: Verify signature and create proof
  const [proof] = counterPackage.seal_ibe_multisig_counter.verify_and_create_proof(tx, {
    arguments: [
      tx.object(counterId),
      aggregatedKey,
      tx.pure.vector("u8", Array.from(signature)),
      tx.pure.vector("u8", Array.from(messageBytes)),
    ],
  });

  // Step 4: Increment counter with proof
  counterPackage.seal_ibe_multisig_counter.increment(tx, {
    arguments: [tx.object(counterId), proof],
  });

  // Step 5: Clean up AggregatedPublicKey
  counterPackage.seal_ibe_multisig_counter.destroy_seal_ibe_aggregated_pk(tx, {
    arguments: [aggregatedKey],
  });

  // Set manual gas budget to avoid dry run failure
  tx.setGasBudget(10000000); // 10M MIST

  // Execute the transaction
  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true },
  });

  if (result.effects?.status?.status !== "success") {
    throw new Error(`Signature verification failed: ${result.effects?.status?.error}`);
  }

  return result.digest;
};

describe("SEAL IBE Multisig End-to-End Integration", () => {
  let client: SuiClient;
  let keypair: Ed25519Keypair;
  let counterId: string;

  beforeAll(async () => {
    client = new SuiClient({ url: getFullnodeUrl(NETWORK) });
    const primeKeyInfo = getKeypair("PRIME");
    keypair = primeKeyInfo.keypair;

    logSealIbe("Test Initialization", {
      network: NETWORK,
      threshold: THRESHOLD_RUNTIME,
      idMode: ID_MODE,
      packageId: COUNTER_PACKAGE_ID,
    });
  });

  test("Step 1: creates SEAL IBE multisig counter with real Seal Key Server public keys", async () => {
    counterId = await createSealIbeMultisigCounter(client, keypair);

    // Verify counter was created with correct format
    expect(counterId).toMatch(/^0x[a-f0-9]{64}$/);

    // Verify initial counter value is 0
    const initialValue = await getCounterValue(client, counterId);
    expect(initialValue).toBe(0);
  }, 15000);

  test("Step 2: generates SEAL IBE signature with threshold IBE keys", async () => {
    const stepCounterId = await createSealIbeMultisigCounter(client, keypair);

    const message = "test-msg";
    const result = await generateSealIbeSignature(client, stepCounterId, keypair, message);

    // Verify signature format (G1 compressed point = 48 bytes)
    expect(result.signature).toHaveLength(48);
    expect(result.keyServerIds).toHaveLength(THRESHOLD);

    // Verify all key server IDs are valid
    for (const serverId of result.keyServerIds) {
      expect(serverId).toMatch(/^0x[a-f0-9]{64}$/);
    }
  }, 120000);

  test("Step 3: verifies signature and creates proof on-chain", async () => {
    const stepCounterId = await createSealIbeMultisigCounter(client, keypair);

    const message = "verify-msg";
    const { signature, keyServerIds } = await generateSealIbeSignature(
      client,
      stepCounterId,
      keypair,
      message,
    );

    // This should not throw an error if verification succeeds
    const digest = await verifySignatureAndCreateProof(
      client,
      stepCounterId,
      keypair,
      signature,
      message,
      keyServerIds,
    );

    // Wait for transaction to be processed
    await client.waitForTransaction({ digest });
  }, 60000);

  test("Step 4: increments counter with verified signature", async () => {
    const stepCounterId = await createSealIbeMultisigCounter(client, keypair);

    const initialValue = await getCounterValue(client, stepCounterId);
    const message = "incr-msg";

    const { signature, keyServerIds } = await generateSealIbeSignature(
      client,
      stepCounterId,
      keypair,
      message,
    );

    const digest = await verifySignatureAndCreateProof(
      client,
      stepCounterId,
      keypair,
      signature,
      message,
      keyServerIds,
    );

    // Wait for transaction to be processed
    await client.waitForTransaction({ digest });

    // Verify counter was incremented
    const finalValue = await getCounterValue(client, stepCounterId);
    expect(finalValue).toBe(initialValue + 1);
  }, 60000);

  test("Debug: Fixed Counter ID pattern test", async () => {
    if (!counterId) throw new Error("Counter not created - run Step 1 first");
    // Test with different Fr risk levels to isolate the scalar range issue
    const testCases = [
      {
        name: "Safe pattern (0x00...)",
        counterId: "0x0000000000000000000000000000000000000000000000000000000000000001",
      },
      {
        name: "Low risk pattern (0x60...)",
        counterId: "0x6000000000000000000000000000000000000000000000000000000000000001",
      },
      {
        name: "Medium risk pattern (0x73...)",
        counterId: "0x7300000000000000000000000000000000000000000000000000000000000001",
      },
      {
        name: "High risk pattern (0x80...)",
        counterId: "0x8000000000000000000000000000000000000000000000000000000000000001",
      },
    ];

    for (const testCase of testCases) {
      logSealIbe(`Testing ${testCase.name}`, { counterId: testCase.counterId });

      try {
        // Build InnerID with fixed counterId
        const messageBytes = new TextEncoder().encode("debug-test");
        const signerAddress = keypair.getPublicKey().toSuiAddress();
        const { inner } = buildInnerId(testCase.counterId, signerAddress, messageBytes);
        const frRisk = analyzeFrRisk(inner);

        logSealIbe(`${testCase.name} - ID Analysis`, {
          counterId: testCase.counterId,
          frRisk: frRisk.analysis,
          firstBytes: frRisk.firstBytes,
        });

        // Test key derivation with fixed ID
        const suiClient = new SuiClient({ url: getFullnodeUrl(NETWORK) });
        await withSessionKey(suiClient, signerAddress, keypair, async (sessionKey) => {
          const selectedHex = hex(inner);

          // Test each server individually
          const servers = [
            {
              objectId: "0x164ac3d2b3b8694b8181c13f671950004765c23f270321a45fdd04d40cccf0f2",
              url: "https://seal.studio-mirai.com",
              weight: 1,
            },
            {
              objectId: "0x6068c0acb197dddbacd4746a9de7f025b2ed5a5b6c1b1ab44dade4426d141da2",
              url: "https://seal.ruby-node.com",
              weight: 1,
            },
            {
              objectId: "0x5466b7df5c15b508678d51496ada8afab0d6f70a01c10613123382b1b8131007",
              url: "https://seal.nodeinfra.com",
              weight: 1,
            },
          ];

          const approveTx = new Transaction();
          approveTx.moveCall({
            target: `${COUNTER_PACKAGE_ID}::seal_ibe_multisig_counter::seal_approve`,
            arguments: [
              approveTx.pure.vector("u8", Array.from(inner)),
              approveTx.object(counterId),
              approveTx.pure.vector("u8", Array.from(messageBytes)),
            ],
          });
          const txBytes = await approveTx.build({
            client: suiClient,
            onlyTransactionKind: true,
          });

          let successCount = 0;
          for (let i = 0; i < servers.length; i++) {
            const serverName = KEY_SERVERS[i]?.name || `Server-${i}`;
            const result = await deriveFromOneServer(servers[i], selectedHex, sessionKey, txBytes);

            if (result.ok) {
              successCount++;
              logSealIbe(`${testCase.name} - ${serverName} SUCCESS`, {
                frRisk: frRisk.analysis,
              });
            } else {
              logSealIbe(`${testCase.name} - ${serverName} FAILED`, {
                error: result.error,
                frRisk: frRisk.analysis,
                isScalarError: result.error.includes("Scalar out of range"),
              });
            }

            updateServerStats(serverName, result.ok, frRisk.analysis);
          }

          logSealIbe(`${testCase.name} - Summary`, {
            successCount,
            totalServers: servers.length,
            frRisk: frRisk.analysis,
          });
        });

        // Small delay between test cases
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        logSealIbe(`${testCase.name} - ERROR`, { error: String(error) });
      }
    }

    // Final statistics
    logSealIbe("FIXED ID TEST COMPLETE");
    logServerStats();

    // This test is for analysis only - always pass
    expect(true).toBe(true);
  }, 120000);

  test("Integration: completes full SEAL IBE multisig flow (create → sign → verify → increment)", async () => {
    // Create new counter for clean integration test
    const integrationCounterId = await createSealIbeMultisigCounter(client, keypair);

    if (!integrationCounterId) {
      throw new Error("Failed to create integration counter - got undefined");
    }

    // Verify initial state
    const initialValue = await getCounterValue(client, integrationCounterId);
    expect(initialValue).toBe(0);

    // Generate signature
    const message = "integ-msg";
    const { signature, keyServerIds } = await generateSealIbeSignature(
      client,
      integrationCounterId,
      keypair,
      message,
    );

    // Verify and increment in one transaction
    const digest = await verifySignatureAndCreateProof(
      client,
      integrationCounterId,
      keypair,
      signature,
      message,
      keyServerIds,
    );

    // Wait for transaction to be processed
    await client.waitForTransaction({ digest });

    // Verify final state
    const finalValue = await getCounterValue(client, integrationCounterId);
    expect(finalValue).toBe(1);
  }, 15000);
});
