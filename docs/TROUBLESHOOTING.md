# Troubleshooting

## Common Issues and Solutions

### 1. "ScreenQueryContext must be used within ScreenQueryProvider" Error

**Cause**: Using useScreenQueryContext hook outside of ScreenQueryProvider

**Solution**:
```tsx
// ❌ Incorrect
function App() {
  const { getQueryResult } = useScreenQueryContext() // Outside Provider
  return <ScreenQueryProvider>...</ScreenQueryProvider>
}

// ✅ Correct
function App() {
  return (
    <ScreenQueryProvider>
      <Content />
    </ScreenQueryProvider>
  )
}

function Content() {
  const { getQueryResult } = useScreenQueryContext() // Inside Provider
  return <div>...</div>
}
```

### 2. Pull-to-Refresh Completes Immediately

**Cause**: Not awaiting refetchQueries

**Solution**:
```tsx
// ❌ Incorrect
const onRefresh = () => {
  setRefreshing(true)
  refetchQueries() // No await
  setRefreshing(false)
}

// ✅ Correct
const onRefresh = async () => {
  setRefreshing(true)
  await refetchQueries() // With await
  setRefreshing(false)
}
```

### 3. Partial UI Updates Still Occurring

**Cause**: Using individual queries instead of getQueryResult

**Solution**: Use getQueryResult to synchronously wait for all queries

```tsx
// ❌ Incorrect - Individual queries
function Component() {
  const query1 = useQuery({ queryKey: ['key1'], queryFn: fn1 })
  const query2 = useQuery({ queryKey: ['key2'], queryFn: fn2 })
  // Updates independently
  return <div>...</div>
}

// ✅ Correct - Synchronized queries
function Component() {
  const { getQueryResult } = useScreenQueryContext()
  const query1 = useQueryKey({ queryKey: ['key1'], queryFn: fn1 })
  const query2 = useQueryKey({ queryKey: ['key2'], queryFn: fn2 })
  const [data1, data2] = getQueryResult([query1, query2])
  return <div>...</div>
}
```


### 4. Suspense Boundary Not Catching Loading States

**Cause**: Component not throwing Promise properly

**Debugging Steps**:

1. Check if ScreenQueryProvider wraps the component
2. Verify Suspense boundary is correctly placed
3. Ensure queries are being processed through getQueryResult

```tsx
// ✅ Correct structure
<ScreenQueryProvider>
  <ErrorBoundary>
    <Suspense fallback={<Loading />}>
      <Component /> {/* Uses getQueryResult */}
    </Suspense>
  </ErrorBoundary>
</ScreenQueryProvider>
```

### 5. ErrorBoundary Not Catching Query Errors

**Cause**: Errors not being thrown properly

**Common Issues**:
- Using try-catch around getQueryResult
- ErrorBoundary placed incorrectly

```tsx
// ❌ Incorrect - Catching errors prevents ErrorBoundary
function Component() {
  try {
    const data = getQueryResult([useQuery()])
    return <View>{data}</View>
  } catch (error) {
    return <ErrorView /> // ErrorBoundary won't catch this
  }
}

// ✅ Correct - Let ErrorBoundary handle errors
function Component() {
  const data = getQueryResult([useQuery()]) // Let errors bubble up
  return <View>{data}</View>
}
```

### 6. Performance Issues with Large Query Sets

**Symptoms**:
- Slow rendering
- High memory usage
- Delayed updates

**Solutions**:

1. **Split large query sets**:
```tsx
// ❌ Too many queries at once
const [...data] = getQueryResult([
  useQuery1(), useQuery2(), /* ... 20+ queries */
])

// ✅ Split into logical groups
const [userData] = getQueryResult([useUserQuery()])
const [postsData] = getQueryResult([usePostsQuery()])
```

2. **Use nested Suspense for progressive loading**:
```tsx
<Suspense fallback={<BasicSkeleton />}>
  <BasicContent />
  <Suspense fallback={<DetailedSkeleton />}>
    <DetailedContent />
  </Suspense>
</Suspense>
```

### 7. Cache Not Clearing Properly

**Cause**: Incorrect clearCache usage or timing

**Solutions**:

```tsx
// ✅ Clear error queries on retry
<ErrorBoundary
  onRetry={async () => {
    await clearCache('error') // Only clear error queries
  }}
>

// ✅ Clear all cache on logout
const logout = async () => {
  await clearCache('all') // Clear everything
  // Navigate to login
}
```


## Debugging Tips

### 1. Check Provider Hierarchy

Ensure proper nesting order:
```tsx
<QueryClientProvider client={queryClient}>
  <ScreenQueryProvider>
    <ErrorBoundary>
      <Suspense>
        <YourComponent />
      </Suspense>
    </ErrorBoundary>
  </ScreenQueryProvider>
</QueryClientProvider>
```

### 2. Monitor Query States

```typescript
// Debug query states before calling getQueryResult
const debugGetQueryResult = (queries) => {
  console.log('Queries:', queries.map(q => ({
    key: q.queryKey,
    status: q.status,
    error: q.error
  })))
  return getQueryResult(queries)
}
```

## Best Practices for Prevention

1. **Always wrap components with ScreenQueryProvider**
2. **Use useQueryKey hook for cleaner integration with getQueryResult**
3. **Use proper error boundaries and Suspense**
4. **Follow React hooks rules strictly**
5. **Test with various network conditions**