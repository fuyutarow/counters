"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

interface SponsoredTransactionContextValue {
  enabled: boolean;
  setPreference: (value: boolean) => void;
  toggle: () => void;
}

const SponsoredTransactionContext = createContext<SponsoredTransactionContextValue | undefined>(
  undefined,
);

interface SponsoredTransactionProviderProps {
  children: ReactNode;
}

const STORAGE_KEY = "sponsored-transaction-preference";
const DEFAULT_PREFERENCE = true;

export function SponsoredTransactionProvider({ children }: SponsoredTransactionProviderProps) {
  const [preference, setPreferenceState] = useState<boolean>(() => {
    if (typeof window === "undefined") {
      return DEFAULT_PREFERENCE;
    }
    const storedValue = window.localStorage.getItem(STORAGE_KEY);
    if (storedValue === null) {
      return DEFAULT_PREFERENCE;
    }
    return storedValue === "true";
  });

  const handleSetPreference = useCallback((value: boolean) => {
    setPreferenceState(value);
  }, []);

  const toggle = useCallback(() => {
    setPreferenceState((prev) => !prev);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, preference ? "true" : "false");
  }, [preference]);

  const value = useMemo<SponsoredTransactionContextValue>(() => {
    return {
      enabled: preference,
      setPreference: handleSetPreference,
      toggle,
    };
  }, [preference, handleSetPreference, toggle]);

  return (
    <SponsoredTransactionContext.Provider value={value}>
      {children}
    </SponsoredTransactionContext.Provider>
  );
}

export function useSponsoredTransactionPreference(): SponsoredTransactionContextValue {
  const context = useContext(SponsoredTransactionContext);
  if (!context) {
    throw new Error(
      "useSponsoredTransactionPreference must be used within a SponsoredTransactionProvider",
    );
  }
  return context;
}
