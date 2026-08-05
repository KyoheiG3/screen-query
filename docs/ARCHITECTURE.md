# System Architecture

## Overview

ScreenQueryProvider is a React Context system that integrates React Query (TanStack Query) with React Suspense/ErrorBoundary to synchronously manage multiple queries, preventing partial UI updates and screen flickering.

### Problems Solved

- **Prevention of partial UI updates**: Prevents screen flickering caused by multiple queries completing individually
- **Synchronized Pull-to-Refresh control**: Updates UI only once after all queries are completed
- **Natural integration with Suspense**: Throws query states as Promises that can be handled by Suspense
- **Centralized error handling**: Unified error handling through ErrorBoundary

## Overall Structure

```
┌─────────────────────────────────────────┐
│         ScreenQueryProvider             │
│  ┌───────────────────────────────────┐  │
│  │    ScreenQueryContext             │  │
│  │  - getQueryResult                 │  │
│  │  - refetchQueries                 │  │
│  │  - clearCache                     │  │
│  └───────────────────────────────────┘  │
│                                         │
│  Internal State Management:             │
│  - queriesRef (Map)                     │
│  - observersRef (Map)                   │
│  - queryPromiseRef (Map)                │
└─────────────────────────────────────────┘
                    │
    ┌───────────────┼───────────────┐
    ▼               ▼               ▼
useScreenQueryContext    useQueryKey
```

## Main Components

- **ScreenQueryProvider**: Context provider that manages all query states
- **ScreenQueryContext**: Context that child components access
- **useScreenQueryContext**: Hook to access the context
- **useQueryKey**: Helper hook that wraps useQuery and includes queryKey in return value

## ScreenQueryProvider Mechanism

### Internal State Management

```typescript
// Manages registered queries
const queriesRef = useRef<Map<string, ScreenQuery>>(new Map())

// Manages QueryObserver instances
const observersRef = useRef<Map<string, QueryObserver>>(new Map())

// Query keys already reported as detached, to keep the warning to one per key
const warnedRef = useRef<Set<string>>(new Set())

// Manages asynchronous Promise handling
const queryPromiseRef = useRef<Map<string, Promise<void>>>(new Map())
```

### Main Functions

#### 1. getQueryResult
Retrieves results for specified queries, throwing Promise during loading, Error on error, or returning data array on success.

```typescript
const getQueryResult = (
  results: readonly ScreenQueryResult[],
  options?: { suspendOnCreate?: boolean }
) => {
  // Register or retrieve Observer
  // Check loading state or suspendOnCreate option
  // Throw Promise or Error, or return data
}
```

**Options**:
- `suspendOnCreate` - If true, throws Promise when observer is first created (default: `false`)

#### 2. refetchQueries
Refetches all registered queries. Controls notifications to achieve batch updates.

```typescript
const refetchQueries = async () => {
  // Temporarily disable notifications
  notifyManager.setNotifyFunction(() => {})

  try {
    // Refetch all queries in parallel
    await Promise.all(/* ... */)
  } finally {
    // Restore notifications (batch update occurs at this point)
    notifyManager.setNotifyFunction((fn) => fn())
  }
}
```

#### 3. clearCache
Clears cache for error state queries or all queries.

### Observer Lifecycle

Provider-owned observers live in `observersRef` until `clearCache` or provider
unmount destroys them, but they are only **subscribed** while a suspend promise is
waiting on them (`createObserverPromise`). That asymmetry is worth understanding,
because an unsubscribed observer neither keeps its query in the cache nor receives
updates about it:

- While a screen loads, the consumer's own observer (`useQuery` / `useQueryKey`) is
  not subscribed either - a suspended render never reaches its effects - so between
  the fetch settling and the retried render committing, the query can have **zero
  observers**. A `gcTime: 0` entry is garbage collected in that window.
- The consumer then rebuilds the query as pending on its next render, while the
  provider's observer still holds the collected one and reports it as successful.

Left alone that combination makes `getQueryResult` return `undefined` for a query it
considers settled - a crash at the first property access. So a reused observer is
re-pointed at the query currently in the cache (`syncObserverQuery`), which turns the
situation into a normal suspend-and-refetch. The same applies when the entry is
replaced deliberately by `removeQueries` / `queryClient.clear()`.

Recovering is not free: the query is fetched again, and a screen that had already
painted falls back to its loading state before painting a second time. Since that is
a real cost hiding behind a working screen, the recovery is reported once per query
key with `console.warn` outside production (`warnDetachedQuery`). The usual fix on
the consumer side is a `gcTime` larger than the gap between the fetch settling and
the render committing - a second is plenty, and the entry is still discarded when the
screen goes away.

### Notification Control Mechanism

```mermaid
sequenceDiagram
    participant UI as UI Component
    participant SP as ScreenQueryProvider
    participant NM as notifyManager
    participant RQ as React Query

    UI->>SP: refetchQueries()
    SP->>NM: setNotifyFunction(() => {})
    Note over NM: Pause notifications

    SP->>RQ: refetch query 1
    SP->>RQ: refetch query 2
    SP->>RQ: refetch query N

    Note over RQ: All queries completed

    SP->>NM: setNotifyFunction((fn) => fn())
    Note over NM: Restore notifications
    NM->>UI: Batch UI update
```

## Core Features

### Query Synchronization
- All queries within a ScreenQueryProvider are synchronized
- UI updates only occur when all queries are complete
- Prevents partial rendering states

### Error Boundary Integration
- Errors from any query are thrown to be caught by ErrorBoundary
- Centralized error handling across multiple queries
- Clean separation between loading, error, and success states

### Suspense Integration
- Loading states are thrown as Promises for Suspense to catch
- Natural integration with React's concurrent features
- Progressive loading with nested Suspense boundaries

## Performance Optimizations

### Map-based O(1) Access
Internal state uses Map for high-performance lookups with constant time complexity.

### Promise Deduplication
Identical query sets share the same Promise, reducing memory allocation and preventing duplicate network requests.

### Notification Batching
Controls React Query's notification system to batch UI updates, preventing partial updates and reducing render count.