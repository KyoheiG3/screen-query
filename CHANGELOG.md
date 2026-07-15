# Changelog

## 0.0.1

Initial release of `screen-query` — React Query integration for synchronized
multi-query management with Suspense and ErrorBoundary support.

### Features

- **`ScreenQueryProvider`** — coordinates multiple queries on a screen through a
  shared set of QueryObservers, integrating React Query with Suspense and
  ErrorBoundary. Exposes `getQueryResult`, `clearCache`, and `refetchAllQueries`
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
