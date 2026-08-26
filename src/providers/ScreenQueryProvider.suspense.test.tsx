import {
  type QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import React, { Suspense } from 'react'
import { ScreenQueryProvider } from '~/providers/ScreenQueryProvider'
import {
  createQueryClient,
  delay,
  useTestScreenQueryContext,
} from '~/test-utils/screen-query'

/**
 * Renders a thrown error as text so a broken render reads as an assertion
 * failure instead of an unhandled exception.
 */
class TestBoundary extends React.Component<
  { children: React.ReactNode },
  { error?: Error }
> {
  state: { error?: Error } = {}

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    return this.state.error
      ? `error: ${this.state.error.message}`
      : this.props.children
  }
}

const queryKey = ['suspense-user']

describe('ScreenQueryProvider through a Suspense boundary', () => {
  let queryClient: QueryClient
  let fetchCount: number
  let renderCount: number
  let resolvedUndefined: boolean

  // createQueryClient defaults every query to gcTime: 0, which is what makes a
  // query collectable the moment its last observer unsubscribes. The delay keeps
  // the fetch settling on a timer, as it would over the network - resolving in a
  // microtask would let React retry the render before any timer can run.
  const queryFn = async () => {
    fetchCount++
    await delay(10)
    return { name: 'Test User' }
  }

  function Consumer({ gcTime }: { gcTime?: number }) {
    renderCount++
    // Spread conditionally: an explicit undefined would override the client
    // default (gcTime: 0) instead of falling back to it
    const query = useQuery({
      queryKey,
      queryFn,
      ...(gcTime !== undefined && { gcTime }),
    })
    const context = useTestScreenQueryContext()
    const [data] = context.getQueryResult([{ ...query, queryKey }])

    // getQueryResult must suspend rather than hand back a settled-looking
    // undefined, so record it instead of dereferencing
    if (data === undefined) {
      resolvedUndefined = true
      return 'data: undefined'
    }

    return `data: ${data.name}`
  }

  function tree(gcTime?: number) {
    return (
      <QueryClientProvider client={queryClient}>
        <ScreenQueryProvider>
          <TestBoundary>
            <Suspense fallback="loading">
              <Consumer gcTime={gcTime} />
            </Suspense>
          </TestBoundary>
        </ScreenQueryProvider>
      </QueryClientProvider>
    )
  }

  beforeEach(() => {
    // Given: Initialize new QueryClient
    queryClient = createQueryClient()
    fetchCount = 0
    renderCount = 0
    resolvedUndefined = false
  })

  afterEach(() => {
    // Cleanup after test
    vi.restoreAllMocks()
    queryClient.clear()
  })

  it('should resolve data for a gcTime: 0 query', async () => {
    // Given: A suspended consumer, so its own observer never subscribes and the
    // query is left collectable the moment the fetch settles
    render(tree())
    expect(screen.getByText('loading')).toBeTruthy()

    // When: The query settles and React retries the render
    await waitFor(() => {
      expect(screen.getByText('data: Test User')).toBeTruthy()
    })

    // Then: The query was never resolved as undefined on the way there
    expect(resolvedUndefined).toBe(false)
  })

  it('should suspend instead of resolving undefined after the query is removed', async () => {
    // Given: A resolved consumer
    const { rerender } = render(tree())
    await waitFor(() => {
      expect(screen.getByText('data: Test User')).toBeTruthy()
    })
    const fetchCountBeforeRemoval = fetchCount

    // When: The cache entry is dropped from the outside and the tree re-renders
    act(() => {
      queryClient.removeQueries({ queryKey, exact: true })
    })
    rerender(tree())

    // Then: The detached observer snapshot is not trusted as settled, and the
    // query is fetched again without ever resolving as undefined
    await waitFor(() => {
      expect(screen.getByText('data: Test User')).toBeTruthy()
    })
    expect(fetchCount).toBeGreaterThan(fetchCountBeforeRemoval)
    expect(resolvedUndefined).toBe(false)
  })

  it('should suspend instead of resolving undefined after the query is reset', async () => {
    // Given: A resolved consumer whose cache entry outlives its observers, so the
    // only thing that changes below is the state of the query, not its identity
    render(tree(60_000))
    await waitFor(() => {
      expect(screen.getByText('data: Test User')).toBeTruthy()
    })
    const fetchCountBeforeReset = fetchCount
    const renderCountBeforeReset = renderCount

    // When: The query is rewound in place - reset() keeps the same Query object,
    // so an observer holding it sees no change of identity to react to
    await act(async () => {
      void queryClient.resetQueries()
      // React Query flushes its notifications on a timer, so the rewound state
      // only reaches the consumer after a tick - the refetch behind it is still
      // in flight by then
      await delay(0)
    })

    // Then: The rewound state is read as pending, so the screen falls back while
    // the query is fetched again instead of being handed a settled-looking
    // undefined
    expect(screen.getByText('loading')).toBeTruthy()
    await waitFor(() => {
      expect(screen.queryByText('loading')).toBeNull()
    })
    expect(screen.getByText('data: Test User')).toBeTruthy()
    expect(fetchCount).toBeGreaterThan(fetchCountBeforeReset)
    expect(resolvedUndefined).toBe(false)

    // And: it fell back once and painted once, rather than retrying as fast as
    // the suspend promise can resolve until the fetch happens to land - which is
    // what a promise that settles against a state the decision rejected does
    expect(renderCount - renderCountBeforeReset).toBeLessThanOrEqual(10)
  })

  it('should warn that a gcTime: 0 query was collected mid-resolution', async () => {
    // Given: A suspended consumer whose query is collectable
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // When: It resolves, which means the query was collected and rebuilt on the way
    render(tree())
    await waitFor(() => {
      expect(screen.getByText('data: Test User')).toBeTruthy()
    })

    // Then: The recovery is not swallowed silently - this is the case that used to
    // crash, and the refetch behind it is worth fixing with a larger gcTime
    expect(warnSpy).toHaveBeenCalled()
    expect(warnSpy.mock.calls[0]?.[0]).toContain('[screen-query]')
    expect(warnSpy.mock.calls[0]?.[0]).toContain('gcTime: 0')
    expect(warnSpy.mock.calls[0]?.[1]).toEqual(queryKey)
  })

  it('should warn only once per query key', async () => {
    // Given: A resolved consumer whose cache entry keeps being dropped
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { rerender } = render(tree())
    await waitFor(() => {
      expect(screen.getByText('data: Test User')).toBeTruthy()
    })
    const warnCountAfterFirstRecovery = warnSpy.mock.calls.length

    // When: It happens again
    act(() => {
      queryClient.removeQueries({ queryKey, exact: true })
    })
    rerender(tree())
    await waitFor(() => {
      expect(screen.getByText('data: Test User')).toBeTruthy()
    })

    // Then: The log stays at one line per key
    expect(warnCountAfterFirstRecovery).toBe(1)
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it('should not warn when the query stays in the cache', async () => {
    // Given: A suspended consumer whose query is not collectable
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // When: It resolves
    render(tree(60_000))
    await waitFor(() => {
      expect(screen.getByText('data: Test User')).toBeTruthy()
    })

    // Then: Nothing to report
    expect(warnSpy).not.toHaveBeenCalled()
  })
})
