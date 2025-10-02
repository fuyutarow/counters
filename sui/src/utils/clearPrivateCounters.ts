/**
 * Clear private counter localStorage data
 *
 * Use this when package ID changes to remove counters from old package
 */

export function clearPrivateCounters() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("privateCounters");
  console.log("Private counters cleared from localStorage");
}

// For browser console access
if (typeof window !== "undefined") {
  (window as any).clearPrivateCounters = clearPrivateCounters;
}
