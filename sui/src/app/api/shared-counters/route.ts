import { SuiGraphQLClient } from "@mysten/sui/graphql";
import consola from "consola";
import { ResultAsync } from "neverthrow";
import { NextResponse } from "next/server";
import { getSharedCountersQuery } from "@/graphql/counter-queries";
import { getGraphQLUrl, type Network } from "@/types/network";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const networkParam = searchParams.get("network") || "testnet";
  const counterType = searchParams.get("type");

  if (!counterType) {
    return NextResponse.json({ error: "Missing type parameter" }, { status: 400 });
  }

  const network = (
    ["devnet", "testnet", "mainnet"].includes(networkParam) ? networkParam : "testnet"
  ) as Network;

  const gqlClient = new SuiGraphQLClient({
    url: getGraphQLUrl(network),
  });

  const queryResult = await ResultAsync.fromPromise(
    gqlClient.query({
      query: getSharedCountersQuery,
      variables: {
        type: counterType,
      },
    }),
    (error) => (error instanceof Error ? error : new Error("Unknown GraphQL error")),
  );

  if (queryResult.isErr()) {
    consola.error("[API] SharedCounters GraphQL query failed:", queryResult.error);
    return NextResponse.json({ error: queryResult.error.message }, { status: 500 });
  }

  const result = queryResult.value;

  if (result.errors && result.errors.length > 0) {
    return NextResponse.json(
      { error: `GraphQL error: ${result.errors[0]?.message}` },
      { status: 500 },
    );
  }

  const counters: Array<{ id: string; value: string; version: string }> = [];

  const data = result.data as { objects?: { nodes?: unknown[] } };

  if (data?.objects?.nodes) {
    for (const nodeItem of data.objects.nodes) {
      const node = nodeItem as {
        asMoveObject?: {
          contents?: {
            json?: unknown;
            type?: { repr?: string };
          };
        };
        address?: string;
        version?: string | number;
      };

      if (
        node?.asMoveObject?.contents &&
        node.address &&
        node.version &&
        typeof node.asMoveObject.contents === "object" &&
        node.asMoveObject.contents !== null
      ) {
        const contents = node.asMoveObject.contents;
        if (!contents.json) continue;

        const jsonData = contents.json as { value?: string | number | bigint };

        if (jsonData.value !== undefined) {
          counters.push({
            id: node.address,
            value: String(jsonData.value),
            version: String(node.version),
          });
        }
      }
    }
  }

  return NextResponse.json({ counters });
}
