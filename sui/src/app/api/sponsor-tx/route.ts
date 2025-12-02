/**
 * Enoki Sponsored Transaction API
 *
 * This endpoint sponsors transactions using Enoki's infrastructure.
 */

import { EnokiClient } from "@mysten/enoki";
import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import consola from "consola";
import { Hono } from "hono";
import { handle } from "hono/vercel";
import { err, ResultAsync } from "neverthrow";

import { serverEnv } from "@/env/server";
import { counterNetworkDefinitions, type NetworkName } from "@/networkConstants";

function normalizeNetwork(network: string): NetworkName {
  if (network === "devnet" || network === "mainnet" || network === "testnet") {
    return network;
  }
  return "testnet";
}

function getEnokiClient(): EnokiClient {
  const apiKey = serverEnv.ENOKI_SECRET_KEY;
  if (!apiKey) {
    throw new Error("ENOKI_SECRET_KEY is not configured");
  }
  return new EnokiClient({ apiKey });
}

function getSuiClient(network: NetworkName): SuiClient {
  return new SuiClient({ url: getFullnodeUrl(network) });
}

function getAllowedMoveCallTargets(network: NetworkName): string[] {
  const variables = counterNetworkDefinitions[network]?.variables;
  const packageId =
    "counterPackageId" in variables ? variables.counterPackageId?.trim() : undefined;

  if (!packageId) {
    consola.warn(`No counterPackageId configured for network: ${network}`);
    return [];
  }

  return [
    // owned_counter
    `${packageId}::owned_counter::new`,
    `${packageId}::owned_counter::increment`,
    `${packageId}::owned_counter::set_value`,
    // shared_counter
    `${packageId}::shared_counter::share`,
    `${packageId}::shared_counter::increment`,
    `${packageId}::shared_counter::set_value`,
  ];
}

const app = new Hono()
  .basePath("/api/sponsor-tx")
  .post("/", async (c) => {
    const result = await ResultAsync.fromPromise(
      c.req.json() as Promise<{
        transactionKindBytes?: string;
        sender?: string;
        network?: string;
        allowedAddresses?: string[];
      }>,
      () => new Error("Invalid JSON body"),
    ).andThen(({ transactionKindBytes, sender, network = "testnet", allowedAddresses }) => {
      if (!transactionKindBytes) {
        return err(new Error("Missing transactionKindBytes"));
      }

      if (!sender) {
        return err(new Error("Missing sender"));
      }

      const normalized = normalizeNetwork(network);
      const enokiClient = getEnokiClient();
      const allowedMoveCallTargets = getAllowedMoveCallTargets(normalized);

      consola.info("Creating sponsored transaction", {
        sender,
        network: normalized,
        allowedMoveCallTargets: allowedMoveCallTargets.length,
      });

      return ResultAsync.fromPromise(
        enokiClient.createSponsoredTransaction({
          network: normalized,
          transactionKindBytes,
          sender,
          allowedMoveCallTargets,
          allowedAddresses: allowedAddresses ?? [sender],
        }),
        (error) =>
          error instanceof Error ? error : new Error("Failed to create sponsored transaction"),
      );
    });

    return result.match(
      (response) => {
        consola.success("Sponsored transaction created", { digest: response.digest });
        return c.json({
          bytes: response.bytes,
          digest: response.digest,
        });
      },
      (error) => {
        const status = error.message.includes("Missing") ? 400 : 500;
        consola.error("Failed to create sponsored transaction", { error: error.message, status });
        return c.json({ error: error.message }, status);
      },
    );
  })
  .put("/", async (c) => {
    const result = await ResultAsync.fromPromise(
      c.req.json() as Promise<{
        digest?: string;
        signature?: string;
        network?: string;
      }>,
      () => new Error("Invalid JSON body"),
    ).andThen(({ digest, signature, network = "testnet" }) => {
      if (!digest) {
        return err(new Error("Missing transaction digest"));
      }

      if (!signature) {
        return err(new Error("Missing user signature"));
      }

      const normalized = normalizeNetwork(network);
      const enokiClient = getEnokiClient();
      const suiClient = getSuiClient(normalized);

      consola.info("Executing sponsored transaction", { digest, network: normalized });

      return ResultAsync.fromPromise(
        enokiClient.executeSponsoredTransaction({
          digest,
          signature,
        }),
        (error) =>
          error instanceof Error ? error : new Error("Failed to execute sponsored transaction"),
      ).andThen((executeResponse) =>
        ResultAsync.fromPromise(
          suiClient.waitForTransaction({
            digest: executeResponse.digest,
            options: {
              showEffects: true,
              showObjectChanges: true,
              showEvents: true,
            },
          }),
          (error) => (error instanceof Error ? error : new Error("Failed to wait for transaction")),
        ),
      );
    });

    return result.match(
      (response) => {
        consola.success("Sponsored transaction executed", { digest: response.digest });
        return c.json({
          digest: response.digest,
          success: response.effects?.status?.status === "success",
        });
      },
      (error) => {
        const status = error.message.includes("Missing") ? 400 : 500;
        consola.error("Failed to execute sponsored transaction", { error: error.message, status });
        return c.json({ error: error.message }, status);
      },
    );
  });

export const runtime = "nodejs";

export const POST = handle(app);
export const PUT = handle(app);
