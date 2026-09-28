# Changelog

## 0.2.0

### Features

- **`retainQueries(queryKeys)`** on the context. It holds queries in the
  registration while a component on screen reads them, and returns the function that
  releases them. `useSyncQuery` calls it from an effect with the keys it reads.
- **`mounted` option on `getQueryResult`** — whether the caller is already on screen.
  `useSyncQuery` passes it from a ref set in a layout effect on the first commit.
  Passing it also hands the queries' registration to `retainQueries`.

### Behavior changes

- **Who waits for what now depends only on whether a caller is on screen.**
  - A caller already on screen waits only for the queries it passes. A painted
    component no longer falls back to loading because another component is loading.
  - A caller still coming on screen also waits for the queries other mounting renders
    registered. It does not wait for the ones painted components hold or update.
  - An unpassed query counts as pending only if the result last passed for it did
    too. A caller that got placeholder data has painted it, so its query holds
    nobody back.
- **`refetchQueries` fetches only the queries on screen**: the held ones, plus the
  ones direct `getQueryResult` calls (without `mounted`) registered.
- **Queries nothing holds leave the registration** once a release has settled (a
  microtask). A query leaves if its last holder released it, if a caller on screen
  registered it without holding it, or once it has settled. Queries registered by
  direct calls stay, as before.
- **Suspend promises are shared by the set of queries waited for**, not the set
  passed.
- **`suspendOnCreate` suspends only on a key's first observer** since the provider
  mounted or `clearCache` ran, so returning to a cached key does not suspend again.
- `ScreenQueryContextValue` has a new member, `retainQueries`. A context value built
  by hand has to provide it.

### Fixes

- **A list whose key follows a condition keeps its previous data on screen.** This
  covers a search term or a filter, kept with `placeholderData: keepPreviousData` or
  `useDeferredValue`. Before, it fell back to loading on changes after the first. A
  key registered with paintable placeholder data got an observer nobody subscribed
  to, which reported it as pending for good. With `useDeferredValue`, a re-render of
  the painted list waited for the key the deferred render had just registered.
- **`refetchQueries` no longer refetches keys nobody reads any more.**
- **A `gcTime: 0` query read through `useSyncQuery` is no longer collected** between
  settling and the retried render committing. It used to be fetched a second time,
  with the "cache entry was replaced" warning. The provider now keeps the query
  observed until the component holds it. Direct `getQueryResult` calls are unchanged.
- The "cache entry was replaced" warning says which callers its `gcTime` advice is
  for.

### Known limits

- A pending query registered by a mounting render that React discarded stays until it
  settles, and components mounting meanwhile wait for it. For example, switching a
  keyed boundary during its first load can make the new content wait for the old
  request, if that request is the slower one. A `ScreenQueryProvider` inside the keyed
  boundary avoids it.

## 0.1.0

### Features

- **`useSyncQuery`** — reads one query result, or an array of them, through
  `getQueryResult` inside a component and returns only the data (a single value, or
  an array in the same order). It passes the `QueryErrorResetBoundary` the component
  renders under, so `onReset={reset}` on the ErrorBoundary is enough to retry a
  failed query - no `clearCache` before resetting. Accepts `suspendOnCreate`.
- **`errorResetBoundary` option on `getQueryResult`** — the value of
  `useQueryErrorResetBoundary()`. While the boundary is reset, failed queries are
  fetched again instead of thrown, the same signal TanStack Query's suspense hooks
  follow. If the retry fails as well, the reset is cleared and the failure is thrown
  to the ErrorBoundary again rather than fetched once more. Without the option,
  `clearCache` is still the way to retry.
- **`ErrorResetBoundary` type** is exported for typing that option.

### Fixes

- **A query that fails without data reaches the ErrorBoundary again.** Since 0.0.3
  the screen stayed on its loading fallback and fetched the failed query again on
  every retried render.

  A render retried after a suspend mounts the consumer's observer afresh, and a fresh
  observer reports a query that failed without data as pending, because it would
  fetch it on mount (`retryOnMount`). The suspended render never commits, so the
  consumer never makes that fetch, and the suspend promise made it through the
  provider's observer instead. `getQueryResult` now checks the cache entry of a passed
  result that reads as pending. A fetch, `clearCache` and `resetQueries()` all put the
  entry back to pending, so an `error` status means nothing has asked for the query
  again: it counts as settled and its error is thrown.

## 0.0.3

### Fixes

- **A query rewound in place no longer resolves as `undefined`.** `getQueryResult`
  decides whether to suspend from the results it was passed - the same source it
  hands back - so a query is never treated as settled while its data is still
  `undefined`, and the declared return type holds.

  A provider-owned observer is unsubscribed as soon as the suspend promise waiting on
  it resolves, so its snapshot stays at whatever the query looked like when it
  settled. `queryClient.resetQueries()` keeps the same `Query` object and only puts
  its state back to pending, and an unsubscribed observer is never told about that, so
  the snapshot kept reading as successful while the consumer's own result was pending.
  Replacing the cache entry - `removeQueries` / `clear()` / garbage collection - was
  already covered, because a replaced entry is something the provider notices.

  Observer snapshots still decide for queries registered by another call, which is
  what keeps a screen from painting in parts.

- **A suspend promise waits on exactly the queries the suspend decision found
  pending.** Deciding against live state while waiting on a stale snapshot resolved
  the promise at once, and the retried render suspended again - spinning through
  renders until the query settled on its own.

- **A screen is no longer torn down by an error its query has recovered from.** The
  error thrown to the ErrorBoundary comes from the results passed in, which follow
  the cache, rather than from an observer snapshot that can still hold an error the
  cache has since replaced with data.

## 0.0.2

### Fixes

- **Observers detached from the cache are no longer trusted as settled.** A reused
  observer is now re-pointed at the query currently in the cache, so the Suspense
  decision is made against live state.

  This is what made `gcTime: 0` queries crash. A suspended render never reaches its
  effects, so neither the consumer's observer nor the provider's is subscribed
  between the fetch settling and the retried render committing — a `gcTime: 0` entry
  is garbage collected in that window. The consumer then rebuilt the query as
  pending while the provider still reported the collected one as successful, so
  `getQueryResult` returned `undefined` for a query it considered settled: a
  `TypeError` at the first property access. The same shape occurs after
  `removeQueries` / `queryClient.clear()`. Such a query now suspends and refetches
  instead.

### Improvements

- **Recovering from a detached query is reported.** Being re-pointed costs a refetch
  and re-suspends a screen that had already painted, so it is logged once per query
  key with `console.warn` outside production instead of being absorbed silently. The
  message points at the usual cause (a `gcTime` shorter than the gap between the
  fetch settling and the render committing) and its fix.

## 0.0.1

Initial release of `screen-query` — React Query integration for synchronized
multi-query management with Suspense and ErrorBoundary support.

### Features

- **`ScreenQueryProvider`** — coordinates multiple queries on a screen through a
  shared set of QueryObservers, integrating React Query with Suspense and
  ErrorBoundary. Exposes `getQueryResult`, `clearCache`, and `refetchQueries`
  via context.
- **`useScreenQueryContext`** — hook to access the provider's query utilities.
- **`useQueryKey` / `useInfiniteQueryKey`** — wrap `useQuery` / `useInfiniteQuery`
  to include `queryKey` in the result (`UseQueryKeyResult` /
  `UseInfiniteQueryKeyResult`).
- **`suspendOnCreate` option** on `getQueryResult` — suspend immediately when a
  QueryObserver is first created, rather than only during the loading state.
- **Custom error types** — `ScreenQueryResult<T, E = Error>` accepts a generic
  error type parameter for type-safe error handling.
- **Resilient error handling** — a query that errors while still holding
  previously-fetched data keeps that data visible and surfaces the error through
  the result instead of tearing down the screen, matching the default
  `throwOnError` behavior of TanStack Query's `useSuspenseQuery` /
  `useSuspenseInfiniteQuery`.
