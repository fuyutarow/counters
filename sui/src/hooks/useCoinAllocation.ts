/**
 * Hook for managing pre-allocated gas coins
 *
 * Requests a dedicated coin from the sponsor for repeated use.
 * Reduces round trips by reusing the same coin ID.
 *
 * Note: version/digest are fetched fresh from API each time (not cached)
 * since they change with every transaction.
 */

import { useCurrentAccount } from "@mysten/dapp-kit";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import consola from "consola";

type CoinRef = {
  coinId: string;
  version: string;
  digest: string;
};

type AllocationInfo = CoinRef & {
  sponsor: string;
  network: string;
};

type AllocationResponse = AllocationInfo & {
  isExisting: boolean;
  txDigest?: string;
};

const ALLOCATION_QUERY_KEY = "coin-allocation";

export function useCoinAllocation() {
  const account = useCurrentAccount();
  const queryClient = useQueryClient();

  const apiUrl =
    typeof window !== "undefined" ? `${window.location.origin}/api/tx/self` : "/api/tx/self";

  // Query for existing allocation
  const {
    data: allocation,
    isLoading,
    error,
  } = useQuery({
    queryKey: [ALLOCATION_QUERY_KEY, account?.address],
    queryFn: async (): Promise<AllocationInfo | null> => {
      if (!account?.address) return null;

      const response = await fetch(`${apiUrl}/coin/${account.address}?network=testnet`);

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => undefined);
        throw new Error(errorData?.error || "Failed to get allocated coin");
      }

      return response.json();
    },
    enabled: !!account?.address,
    staleTime: 30_000, // Consider stale after 30 seconds
    refetchOnWindowFocus: false,
  });

  // Mutation to allocate a new coin
  const allocateMutation = useMutation({
    mutationFn: async (): Promise<AllocationResponse> => {
      if (!account?.address) {
        throw new Error("No wallet connected");
      }

      const response = await fetch(`${apiUrl}/allocate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userAddress: account.address,
          network: "testnet",
          amount: 100_000_000, // 0.1 SUI
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => undefined);
        throw new Error(errorData?.error || "Failed to allocate coin");
      }

      return response.json();
    },
    onSuccess: (data) => {
      consola.success("[CoinAllocation] Coin allocated", {
        coinId: data.coinId,
        isExisting: data.isExisting,
      });
      // Update the query cache
      queryClient.setQueryData([ALLOCATION_QUERY_KEY, account?.address], {
        coinId: data.coinId,
        version: data.version,
        digest: data.digest,
        sponsor: data.sponsor,
        network: data.network,
      });
    },
    onError: (error) => {
      consola.error("[CoinAllocation] Failed to allocate coin", {
        error: error.message,
      });
    },
  });

  // Refresh coin state (get fresh version/digest)
  const refreshCoin = async (): Promise<AllocationInfo | null> => {
    if (!account?.address) return null;

    const response = await fetch(`${apiUrl}/coin/${account.address}?network=testnet`);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    queryClient.setQueryData([ALLOCATION_QUERY_KEY, account?.address], data);
    return data;
  };

  return {
    allocation,
    isLoading,
    error,
    hasAllocation: !!allocation,
    allocate: allocateMutation.mutate,
    allocateAsync: allocateMutation.mutateAsync,
    isAllocating: allocateMutation.isPending,
    refreshCoin,
  };
}
