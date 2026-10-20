/** Storage may be disabled by the host or privacy policy, including its getter. */
export function browserLocalStorage(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; }
  catch { return null; }
}
