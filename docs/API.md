# API Reference

## Hooks

### useScreenQueryContext

Hook to access ScreenQueryProvider context and retrieve query management functions.

```typescript
const { getQueryResult, refetchQueries, clearCache } = useScreenQueryContext()
```

### useQueryKey

A wrapper hook around `useQuery` that automatically includes `queryKey` in the return value, simplifying usage with `getQueryResult`.

```typescript
// Standard useQuery (requires manual spreading)
const query = useQuery({
  queryKey: ['user', userId],
  queryFn: () => fetchUser(userId)
})
const [user] = getQueryResult([
  { ...query, queryKey: query.queryKey }
])

// With useQueryKey (cleaner, recommended)
const query = useQueryKey({
  queryKey: ['user', userId],
  queryFn: () => fetchUser(userId)
})
const [user] = getQueryResult([query])
```

**Type Signature**:
```typescript
export type UseQueryKeyResult<TData = unknown, TError = Error> =
  UseQueryResult<TData, TError> & { queryKey: QueryKey }

export function useQueryKey<
  TQueryFnData = unknown,
  TError = Error,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  options: UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>
): UseQueryKeyResult<TData, TError>
```

**Benefits**:
- Eliminates boilerplate when using `getQueryResult`
- Ensures `queryKey` is always included
- Type-safe and maintains all `useQuery` functionality

### getQueryResult

Function that synchronously waits for multiple queries and returns data. Integrated with Suspense/ErrorBoundary.

```typescript
const { getQueryResult } = useScreenQueryContext()

// Using useQueryKey hooks (recommended)
const reposQuery = useQueryKey({
  queryKey: ['repos', username],
  queryFn: () => fetchRepos(username)
})
const userQuery = useQueryKey({
  queryKey: ['user', username],
  queryFn: () => fetchUser(username)
})

// Synchronously retrieve multiple queries
const [repos, user] = getQueryResult([reposQuery, userQuery])

// With suspendOnCreate option
const [repos, user] = getQueryResult(
  [reposQuery, userQuery],
  { suspendOnCreate: true }
)
```

**Parameters**:
- `results` - Array of query results from `useQuery` (must include `queryKey`)
- `options` - Optional configuration
  - `suspendOnCreate` - If true, throws Promise when observer is first created (default: `false`)

**Behavior**:
- Query is loading → Throws Promise (caught by Suspense)
- Observer created with `suspendOnCreate: true` → Throws Promise (caught by Suspense)
- Query has error → Throws Error (caught by ErrorBoundary)
- Query succeeds → Returns array of data

**Type Signature**:
```typescript
type GetQueryResult = {
  <T extends readonly ScreenQueryResult[]>(
    results: [...T],
    options?: { suspendOnCreate?: boolean },
  ): {
    [K in keyof T]: T[K] extends ScreenQueryResult<infer D> ? D : never
  }
}
```

### refetchQueries

Function that synchronously refetches all registered queries. Used for Pull-to-Refresh and similar operations.

```typescript
const { refetchQueries } = useScreenQueryContext()

const onRefresh = async () => {
  setRefreshing(true)
  await refetchQueries() // Returns after all queries complete
  setRefreshing(false)
}
```

**Features**:
- Uses notifyManager to control notifications
- Batch UI update after all queries complete
- Prevents screen flickering

**Caveats**:
- In certain patterns, the same query may be executed twice. For example, when `getQueryResult` is called multiple times within a single Suspense boundary.
- When queries have dependencies (e.g., the second query depends on the result of the first query), the query key for the dependent query may change after the first refetch. This can result in the initial refetch of the dependent query fetching data that is simply cached but never used.
- **Note**: We are considering adding functionality to customize the refresh process to address these scenarios in future updates.

**Type Signature**:
```typescript
refetchQueries: () => Promise<void>
```

### clearCache

Function to clear cache during error recovery.

```typescript
const { clearCache } = useScreenQueryContext()

// Clear only error state queries
await clearCache('error')

// Clear all queries
await clearCache('all')
```

**Parameters**:
- `'error'`: Clear only queries in error state
- `'all'`: Clear all queries

**Type Signature**:
```typescript
clearCache: (status: ClearCacheStatus) => Promise<void>
```

## Type Definitions

### ScreenQuery

Basic type for identifying queries.

```typescript
type ScreenQuery = {
  queryKey: QueryKey
}
```

### ScreenQueryResult<T>

Type that combines React Query's `UseQueryResult` with `ScreenQuery`. Contains both query execution results and identifier.

```typescript
export type ScreenQueryResult<T = unknown> = UseQueryResult<T> & ScreenQuery
```

**Properties**:
- All properties from `UseQueryResult<T>`
- `queryKey`: QueryKey for identification

### ClearCacheStatus

Type specifying the type of cache clearing.

```typescript
export type ClearCacheStatus = 'error' | 'all'
```

**Values**:
- `'error'`: Clear only queries with errors
- `'all'`: Clear all query caches

## Provider API

### ScreenQueryProvider

Main context provider component.

```typescript
interface ScreenQueryProviderProps {
  children: React.ReactNode
}

function ScreenQueryProvider({ children }: ScreenQueryProviderProps): JSX.Element
```

**Usage**:
```tsx
<ScreenQueryProvider>
  <YourApp />
</ScreenQueryProvider>
```

**Features**:
- Manages internal query state
- Provides context for child components
- Handles QueryObserver lifecycle
- Controls notification batching

## Error Handling

### Context Validation

The hook validates that it's used within a ScreenQueryProvider:

```typescript
function useScreenQueryContext() {
  const context = useContext(ScreenQueryContext)
  if (!context) {
    throw new Error('ScreenQueryContext must be used within ScreenQueryProvider')
  }
  return context
}
```

### Query Error Propagation

Errors from queries are automatically propagated to ErrorBoundary:

```typescript
// If any query in the array has an error, it will be thrown
const query1 = useQueryKey({ queryKey: ['key1'], queryFn: fetchData1 })
const query2 = useQueryKey({ queryKey: ['key2'], queryFn: fetchData2 })

const [data1, data2] = getQueryResult([
  query1, // Could throw error
  query2, // Could throw error
])
```

## Performance Considerations

### Memoization

The context value is memoized to prevent unnecessary re-renders:

```typescript
const contextValue = useMemo(() => ({
  getQueryResult,
  refetchQueries,
  clearCache,
}), [getQueryResult, refetchQueries, clearCache])
```

### Promise Deduplication

Identical query sets share the same Promise to improve performance:

```typescript
// Multiple calls with same queries will share the same Promise
const data1 = getQueryResult([query1, query2])
const data2 = getQueryResult([query1, query2]) // Same Promise reused
```