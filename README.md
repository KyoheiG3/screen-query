# screen-query

React Query integration for synchronous multi-query management with Suspense/ErrorBoundary.

## Features

- 🔄 Synchronous management of multiple queries
- ⚛️ Full React Suspense/ErrorBoundary integration
- 🚀 Prevents partial UI updates and screen flickering
- 📦 TypeScript support with full type safety
- 🔧 Simple and intuitive API

## Installation

```bash
npm install screen-query
# or
yarn add screen-query
# or
pnpm add screen-query
```

## Prerequisites

- React 18.0.0 or higher (React 19 supported)
- @tanstack/react-query 5.0.0 or higher

## Basic Usage

### 1. Setup Provider

Wrap your app with both `QueryClientProvider` and `ScreenQueryProvider`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ScreenQueryProvider } from 'screen-query'

const queryClient = new QueryClient()

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ScreenQueryProvider>
        {/* Your app components */}
      </ScreenQueryProvider>
    </QueryClientProvider>
  )
}
```

### 2. Use in Components

```tsx
import { useQuery } from '@tanstack/react-query'
import { useScreenQueryContext } from 'screen-query'

function UserProfile({ userId }) {
  const userQuery = useQuery({
    queryKey: ['user', userId],
    queryFn: () => fetchUser(userId),
  })

  const postsQuery = useQuery({
    queryKey: ['posts', userId],
    queryFn: () => fetchUserPosts(userId),
  })

  const { getQueryResult } = useScreenQueryContext()

  // This will throw a Promise during loading (handled by Suspense)
  // or throw an Error if any query fails (handled by ErrorBoundary)
  const [userData, postsData] = getQueryResult([
    { ...userQuery, queryKey: userQuery.queryKey },
    { ...postsQuery, queryKey: postsQuery.queryKey }
  ])

  return (
    <div>
      <h1>{userData.name}</h1>
      <div>
        {postsData.map(post => (
          <article key={post.id}>{post.title}</article>
        ))}
      </div>
    </div>
  )
}

// Wrap with Suspense and ErrorBoundary
function UserProfilePage() {
  return (
    <ErrorBoundary fallback={<ErrorFallback />}>
      <Suspense fallback={<Loading />}>
        <UserProfile userId="123" />
      </Suspense>
    </ErrorBoundary>
  )
}
```

## API Reference

### `useQueryKey(options)` / `useInfiniteQueryKey(options)`

Wrapper hooks around `useQuery` / `useInfiniteQuery` that automatically include `queryKey` in the return value, so results can be passed straight to `getQueryResult` without manual spreading.

```tsx
import { useQueryKey } from 'screen-query'

// Without useQueryKey (manual spreading)
const query = useQuery({ queryKey: ['user', userId], queryFn: () => fetchUser(userId) })
const [user] = getQueryResult([{ ...query, queryKey: query.queryKey }])

// With useQueryKey (recommended)
const query = useQueryKey({ queryKey: ['user', userId], queryFn: () => fetchUser(userId) })
const [user] = getQueryResult([query])
```

`useInfiniteQueryKey` works the same way for infinite queries:

```tsx
import { useInfiniteQueryKey } from 'screen-query'

const posts = useInfiniteQueryKey({
  queryKey: ['posts'],
  queryFn: fetchPosts,
  getNextPageParam: (lastPage) => lastPage.nextCursor,
})
const [postsData] = getQueryResult([posts])
```

- **Returns**: the standard `useQuery` / `useInfiniteQuery` result plus a `queryKey` property (`UseQueryKeyResult` / `UseInfiniteQueryKeyResult`)

### `useScreenQueryContext()`

Returns the context value with the following methods:

#### `getQueryResult(results, options?)`

Synchronously get results from multiple queries.

- **Parameters**:
  - `results` - Array of query results from `useQuery` (must include `queryKey`)
  - `options` - Optional configuration
    - `suspendOnCreate` - If true, throws Promise when observer is first created (default: `false`)
- **Returns**: Array of query data in the same order as input
- **Throws**:
  - `Promise` during loading state (handled by Suspense)
  - `Error` when any query has error (handled by ErrorBoundary)

```tsx
const [userData, postsData] = getQueryResult([
  { ...userQuery, queryKey: userQuery.queryKey },
  { ...postsQuery, queryKey: postsQuery.queryKey }
])

// With suspendOnCreate option
const [userData, postsData] = getQueryResult(
  [
    { ...userQuery, queryKey: userQuery.queryKey },
    { ...postsQuery, queryKey: postsQuery.queryKey }
  ],
  { suspendOnCreate: true }
)
```

#### `refetchQueries()`

Refetch all registered queries with batched notifications to prevent partial updates.

```tsx
await refetchQueries() // Useful for pull-to-refresh
```

#### `clearCache(status)`

Clear query cache and reset observers.

- **Parameters**:
  - `'error'` - Clear only queries in error state
  - `'all'` - Clear all registered queries

```tsx
await clearCache('error') // Clear failed queries
await clearCache('all')   // Clear everything
```

## Advanced Patterns

### Pull-to-Refresh Implementation

```tsx
function RefreshableScreen() {
  const { refetchQueries } = useScreenQueryContext()
  const [refreshing, setRefreshing] = useState(false)

  const handleRefresh = async () => {
    setRefreshing(true)
    await refetchQueries()
    setRefreshing(false)
  }

  // Your queries and UI...
}
```

### Error Recovery

```tsx
function ErrorBoundaryWithRetry({ children }) {
  const { clearCache } = useScreenQueryContext()

  return (
    <ErrorBoundary
      fallbackRender={({ error, resetErrorBoundary }) => (
        <div>
          <h2>Something went wrong</h2>
          <button onClick={async () => {
            await clearCache('error')
            resetErrorBoundary()
          }}>
            Try again
          </button>
        </div>
      )}
    >
      {children}
    </ErrorBoundary>
  )
}
```

## TypeScript Support

The library is fully typed. Key types are exported:

```typescript
import type {
  ScreenQueryResult,
  ClearCacheStatus,
  UseQueryKeyResult,
  UseInfiniteQueryKeyResult
} from 'screen-query'
```

## Why screen-query?

When using React Query with multiple queries, components can render in partially loaded states, causing:

- Screen flickering as queries resolve at different times
- Inconsistent UI states
- Poor user experience

screen-query solves this by:

1. **Synchronizing multiple queries** - All queries resolve together
2. **Integrating with React Suspense** - Natural loading states
3. **Batching notifications** - Prevents intermediate renders
4. **Type safety** - Full TypeScript support

## License

MIT © KyoheiG3

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Links

- [GitHub Repository](https://github.com/KyoheiG3/screen-query)
- [Issue Tracker](https://github.com/KyoheiG3/screen-query/issues)