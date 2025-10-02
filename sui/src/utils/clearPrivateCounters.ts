/**
 * Clear private counter localStorage data
 *
 * Use this when package ID changes to remove counters from old package
 */

export function clearPrivateCounters() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("privateCounters");
}

// For browser console access
if (typeof window !== "undefined") {
  (
    window as unknown as { clearPrivateCounters: typeof clearPrivateCounters }
  ).clearPrivateCounters = clearPrivateCounters;
}
