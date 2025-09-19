# Implementation Patterns

## Common Patterns

### Basic Usage Pattern

```tsx
function YourScreen() {
  return (
    <ScreenQueryProvider>
      <YourScreenContent />
    </ScreenQueryProvider>
  )
}

function YourScreenContent() {
  const { getQueryResult } = useScreenQueryContext()

  // Method 1: Using useQueryKey (Recommended - simpler)
  const query1 = useQueryKey({
    queryKey: ['data1'],
    queryFn: fetchData1
  })
  const query2 = useQueryKey({
    queryKey: ['data2'],
    queryFn: fetchData2
  })

  // Simply pass the queries - queryKey is already included
  const [data1, data2] = getQueryResult([query1, query2])

  return (
    <div>
      <span>{data1.title}</span>
      <span>{data2.description}</span>
    </div>
  )
}

// Alternative: Using standard useQuery (requires manual spreading)
function AlternativeExample() {
  const { getQueryResult } = useScreenQueryContext()

  const query = useQuery({
    queryKey: ['data'],
    queryFn: fetchData
  })

  // Must spread and add queryKey explicitly with standard useQuery
  const [data] = getQueryResult([
    { ...query, queryKey: query.queryKey }
  ])

  return <div>{/* UI */}</div>
}
```

### Suspense/ErrorBoundary Integration Patterns

#### Basic Hierarchy Structure

```tsx
<ScreenQueryProvider>
  <ErrorBoundary>
    <Suspense>
      <YourScreenContent />
    </Suspense>
  </ErrorBoundary>
</ScreenQueryProvider>
```

#### Single ErrorBoundary Managing Multiple Suspense

```tsx
function HomeScreen() {
  return (
    <ScreenQueryProvider>
      <HomeScreenContent />
    </ScreenQueryProvider>
  )
}

function HomeScreenContent() {
  const { clearCache } = useScreenQueryContext()

  return (
    <div className="container">
      <ErrorBoundary
        fallback={<ErrorScreen />}
        onReset={async () => {
          await clearCache('error')
        }}
      >
        <h1>Home Screen</h1>


        <Suspense fallback={<UserInfoSkeleton />}>
          <HomeUserInfo />
        </Suspense>

        <Suspense fallback={<RepoListSkeleton />}>
          <HomeRepoList />
        </Suspense>
      </ErrorBoundary>
    </div>
  )
}
```

**Important Behavioral Characteristics**:
- **Loading Display**: Each Suspense displays its own fallback
- **Content Display**: ScreenQueryProvider ensures synchronous display after all queries complete
- **Error Handling**: Single ErrorBoundary centrally manages all errors

#### Nested Suspense Pattern (For Dependencies)

```tsx
function DetailScreen({ id }) {
  return (
    <ScreenQueryProvider>
      <ErrorBoundary>
        <Suspense fallback={<BasicInfoSkeleton />}>
          <BasicInfo id={id} />
          <Suspense fallback={<DetailsSkeleton />}>
            <DetailedContent id={id} />
          </Suspense>
        </Suspense>
      </ErrorBoundary>
    </ScreenQueryProvider>
  )
}

function BasicInfo({ id }) {
  const { getQueryResult } = useScreenQueryContext()

  // Retrieve basic info using useQueryKey
  const basicQuery = useQueryKey({
    queryKey: ['basicInfo', id],
    queryFn: () => fetchBasicInfo(id)
  })

  // No need to spread - queryKey is already included
  const [basicData] = getQueryResult([basicQuery])

  return (
    <div>
      <h2>{basicData.title}</h2>
      <p>{basicData.description}</p>
    </div>
  )
}

function DetailedContent({ id }) {
  const { getQueryResult } = useScreenQueryContext()

  // Retrieve both basic and detailed info using useQueryKey
  const basicQuery = useQueryKey({
    queryKey: ['basicInfo', id],
    queryFn: () => fetchBasicInfo(id)
  })
  const detailQuery = useQueryKey({
    queryKey: ['detailInfo', id],
    queryFn: () => fetchDetailInfo(id)
  })

  // Clean and simple with useQueryKey
  const [basicData, detailData] = getQueryResult([
    basicQuery,   // Retrieved from cache
    detailQuery   // New retrieval
  ])

  return (
    <div>
      {/* Content */}
    </div>
  )
}
```

**Nested Suspense Pattern Characteristics**:
- **Staged Evaluation**: Inner Suspense is evaluated after outer Suspense resolves
- **Staged Display**: Detailed info loading begins after basic info is displayed
- **Cache Utilization**: Same queries in inner components are retrieved instantly from cache
- **Error Propagation**: Errors from any level are caught by the outermost ErrorBoundary
- **Dependency Expression**: Visually expresses data retrieval order and dependencies

#### Multiple ErrorBoundary Pattern (Independent Error Handling)

```tsx
function DashboardScreen() {
  const { clearCache } = useScreenQueryContext()

  return (
    <ScreenQueryProvider>
      <div className="container">
        <h1>Dashboard</h1>


        <ErrorBoundary
          fallback={<ErrorCard message="Failed to fetch statistics data" />}
          onRetry={async () => {
            await clearCache('error')
          }}
        >
          <Suspense fallback={<StatsSkeleton />}>
            <UserStatsSection />
          </Suspense>
        </ErrorBoundary>

        <ErrorBoundary
          fallback={<ErrorCard message="Failed to fetch activity data" />}
          onRetry={async () => {
            await clearCache('error')
          }}
        >
          <Suspense fallback={<ActivitySkeleton />}>
            <RecentActivitySection />
          </Suspense>
        </ErrorBoundary>

        <ErrorBoundary
          fallback={<ErrorCard message="Failed to fetch notifications" />}
          onRetry={async () => {
            await clearCache('error')
          }}
        >
          <Suspense fallback={<NotificationSkeleton />}>
            <NotificationSection />
          </Suspense>
        </ErrorBoundary>
      </div>
    </ScreenQueryProvider>
  )
}

```

**Multiple ErrorBoundary Pattern Characteristics**:
- **Section-level Error Handling**: Each section has its own error handling
- **Partial Display Continuation**: Other sections display normally even if some sections error
- **Individual Retry**: Only errored sections can be retried individually
- **Customized Error Messages**: Appropriate error messages for each section
- **Independence Assurance**: Each section is unaffected by other sections' states

**Usage Guidelines**:
- **Single ErrorBoundary**: When screen-wide consistency is important and partial errors should be treated as overall errors
- **Multiple ErrorBoundary**: When sections have high independence and partial errors shouldn't affect other functionality

### Conditional Query Handling

#### Component Splitting Pattern

```tsx
function ConditionalQueryExample({ userId }) {
  if (!userId) {
    return <EmptyState />
  }

  return <UserContent userId={userId} />
}

function UserContent({ userId }) {
  const { getQueryResult } = useScreenQueryContext()
  const userQuery = useQueryKey({
    queryKey: ['user', userId],
    queryFn: () => fetchUser(userId)
  })
  const [user] = getQueryResult([userQuery])

  return <UserProfile user={user} />
}
```

#### Enabled Option Pattern

```tsx
function ConditionalQueryExample({ userId }) {
  const { getQueryResult } = useScreenQueryContext()

  const userQuery = useQueryKey({
    queryKey: ['user', userId],
    queryFn: () => fetchUser(userId),
    enabled: !!userId
  })

  if (!userId) {
    return <EmptyState />
  }

  const [user] = getQueryResult([userQuery])
  return <UserProfile user={user} />
}
```

### Loading State Coordination

```tsx
function CoordinatedLoadingScreen() {
  const { getQueryResult } = useScreenQueryContext()

  const userQuery = useQueryKey({
    queryKey: ['userData'],
    queryFn: fetchUserData
  })
  const postsQuery = useQueryKey({
    queryKey: ['userPosts'],
    queryFn: fetchUserPosts
  })
  const commentsQuery = useQueryKey({
    queryKey: ['userComments'],
    queryFn: fetchUserComments
  })

  // Clean and simple with useQueryKey
  const [userData, postsData, commentsData] = getQueryResult([
    userQuery,
    postsQuery,
    commentsQuery
  ])

  // All data guaranteed to be available simultaneously
  return (
    <div>
      <UserProfile user={userData} />
      <PostsList posts={postsData} />
      <CommentsList comments={commentsData} />
    </div>
  )
}
```

### Progressive Enhancement Pattern

```tsx
function ProgressiveScreen() {
  return (
    <ScreenQueryProvider>
      <ErrorBoundary>
        <Suspense fallback={<CriticalSkeleton />}>
          <CriticalContent />

          <Suspense fallback={<SecondarySkeleton />}>
            <SecondaryContent />

            <Suspense fallback={<OptionalSkeleton />}>
              <OptionalContent />
            </Suspense>
          </Suspense>
        </Suspense>
      </ErrorBoundary>
    </ScreenQueryProvider>
  )
}
```

## React DOM Specific

### Manual Refresh Implementation

```tsx
function RefreshableScreen() {
  const { refetchQueries, getQueryResult } = useScreenQueryContext()
  const [isRefreshing, setIsRefreshing] = useState(false)

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    try {
      // Synchronously refetch all queries
      await refetchQueries()
    } finally {
      setIsRefreshing(false)
    }
  }, [refetchQueries])

  const query = useQueryKey({
    queryKey: ['yourData'],
    queryFn: fetchYourData
  })
  // Simple and clean with useQueryKey
  const [data] = getQueryResult([query])

  return (
    <div>
      <button onClick={handleRefresh} disabled={isRefreshing}>
        {isRefreshing ? 'Refreshing...' : 'Refresh'}
      </button>
      <div>{data.title}</div>
    </div>
  )
}
```

## React Native Specific

### Pull-to-Refresh Implementation

```tsx
import {
  ScrollView,
  RefreshControl,
  View,
  Text
} from 'react-native'

function RefreshableScreen() {
  const { refetchQueries, getQueryResult } = useScreenQueryContext()
  const [refreshing, setRefreshing] = useState(false)

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await refetchQueries()
    } finally {
      setRefreshing(false)
    }
  }, [refetchQueries])

  const query = useQueryKey({
    queryKey: ['yourData'],
    queryFn: fetchYourData
  })
  // Simple and clean with useQueryKey
  const [data] = getQueryResult([query])

  return (
    <ScrollView
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
        />
      }
    >
      <View>
        <Text>{data.title}</Text>
      </View>
    </ScrollView>
  )
}
```

### FlatList Integration

```tsx
import { FlatList, RefreshControl } from 'react-native'

function ListScreen() {
  const { refetchQueries, getQueryResult } = useScreenQueryContext()
  const [refreshing, setRefreshing] = useState(false)

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await refetchQueries()
    setRefreshing(false)
  }, [refetchQueries])

  const listQuery = useQueryKey({
    queryKey: ['listData'],
    queryFn: fetchListData
  })

  // Clean and simple with useQueryKey
  const [items] = getQueryResult([listQuery])

  return (
    <FlatList
      data={items}
      renderItem={({ item }) => <ItemComponent item={item} />}
      keyExtractor={(item) => item.id}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
        />
      }
    />
  )
}
```


### Navigation Integration

When using with React Navigation, you can reset queries when screen focuses:

```tsx
useFocusEffect(
  useCallback(() => {
    refetchQueries()
  }, [refetchQueries])
)
```