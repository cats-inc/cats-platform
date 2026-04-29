import { QueryClient } from "@tanstack/react-query";

/**
 * Shared QueryClient for every Cats renderer (Chat / Work / Code / Lobby).
 * Defaults are tuned for our local-first, single-tab dev tool:
 *
 * - `staleTime: 5_000` — under five seconds the cached snapshot is fresh,
 *   so navigating between two pages that consume the same query key
 *   (e.g. Tasks list and Task detail) does not re-fetch.
 * - `refetchOnWindowFocus: true` — when the user comes back to the tab
 *   from another window or another product surface, refresh stale
 *   queries automatically.
 * - `refetchOnMount: 'always'` — every time a hook subscribes (page
 *   navigation, dialog open) we re-validate. Combined with `staleTime`
 *   this means: fresh enough → cached, otherwise → re-fetch. This
 *   replaces the old `triggerWorkGraphRefresh()` hand-rolled refresh
 *   pattern.
 * - `retry: 1` — one transient retry; permanent errors surface fast.
 *
 * Cross-product mutation invalidation works because every product
 * shares this single QueryClient instance through `mountWorkspaceApp`.
 * For example, when Code creates a Task, its mutation `onSuccess` calls
 * `queryClient.invalidateQueries({ queryKey: ['tasks'] })` and the
 * Work Tasks page (which is `useQuery({ queryKey: ['tasks'] })`)
 * re-fetches automatically.
 */
export const sharedQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      refetchOnWindowFocus: true,
      refetchOnMount: "always",
      retry: 1,
    },
  },
});
