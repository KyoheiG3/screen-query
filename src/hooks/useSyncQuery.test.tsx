import {
  type QueryClient,
  QueryClientProvider,
  QueryErrorResetBoundary,
} from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import React, { Suspense } from 'react'
import { ScreenQueryProvider } from '~/providers/ScreenQueryProvider'
import {
  createQueryClient,
  delay,
  suppressConsoleError,
} from '~/test-utils/screen-query'
import { useQueryKey } from './useQueryKey'
import { useSyncQuery } from './useSyncQuery'

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

describe('useSyncQuery', () => {
  let queryClient: QueryClient
  let resetErrorBoundary: (() => void) | undefined

  function tree(children: React.ReactNode, attempt = 0) {
    return (
      <QueryClientProvider client={queryClient}>
        <ScreenQueryProvider>
          <QueryErrorResetBoundary>
            {({ reset }) => {
              resetErrorBoundary = reset
              return (
                <TestBoundary key={attempt}>
                  <Suspense fallback="loading">{children}</Suspense>
                </TestBoundary>
              )
            }}
          </QueryErrorResetBoundary>
        </ScreenQueryProvider>
      </QueryClientProvider>
    )
  }

  beforeEach(() => {
    // Given: Initialize new QueryClient
    queryClient = createQueryClient()
    resetErrorBoundary = undefined
  })

  afterEach(() => {
    // Cleanup after test
    vi.restoreAllMocks()
    queryClient.clear()
  })

  it('should unwrap a single result to its data', async () => {
    // Given: A successful query passed on its own
    function Consumer() {
      const name = useSyncQuery(
        useQueryKey({ queryKey: ['single'], queryFn: async () => 'Test User' }),
      )
      return `data: ${name}`
    }

    // When: It resolves
    render(tree(<Consumer />))

    // Then: The data itself comes back, not an array
    await waitFor(() => {
      expect(screen.getByText('data: Test User')).toBeTruthy()
    })
  })

  it('should unwrap an array of results in order', async () => {
    // Given: Two successful queries passed together
    function Consumer() {
      const [name, count] = useSyncQuery([
        useQueryKey({ queryKey: ['name'], queryFn: async () => 'Test User' }),
        useQueryKey({ queryKey: ['count'], queryFn: async () => 3 }),
      ])
      return `data: ${name} / ${count}`
    }

    // When: They resolve
    render(tree(<Consumer />))

    // Then: The data comes back in the order the results were passed
    await waitFor(() => {
      expect(screen.getByText('data: Test User / 3')).toBeTruthy()
    })
  })

  it('should pass suspendOnCreate through to getQueryResult', async () => {
    // Given: A query whose data is already cached, read once without and once with
    // suspendOnCreate
    queryClient.setQueryData(['cached'], 'Cached User')
    const renders = { plain: 0, suspendOnCreate: 0 }
    function Consumer({ suspendOnCreate }: { suspendOnCreate: boolean }) {
      renders[suspendOnCreate ? 'suspendOnCreate' : 'plain']++
      const name = useSyncQuery(
        useQueryKey({
          queryKey: ['cached'],
          queryFn: async () => 'Cached User',
          staleTime: 60_000,
        }),
        { suspendOnCreate },
      )
      return `data: ${name}`
    }

    // When: Each reads the cached query through its own provider
    const plain = render(tree(<Consumer suspendOnCreate={false} />))
    await waitFor(() => {
      expect(screen.getByText('data: Cached User')).toBeTruthy()
    })
    plain.unmount()
    render(tree(<Consumer suspendOnCreate />))
    await waitFor(() => {
      expect(screen.getByText('data: Cached User')).toBeTruthy()
    })

    // Then: Only the one given the option suspended on its new observer first,
    // so it rendered once more before returning the cached data
    expect(renders.plain).toBe(1)
    expect(renders.suspendOnCreate).toBe(2)
  })

  it('should fetch a failed query again when the QueryErrorResetBoundary is reset', async () => {
    // Given: A query read through the hook that failed once
    suppressConsoleError()
    let failing = true
    let fetchCount = 0
    function Consumer() {
      const name = useSyncQuery(
        useQueryKey({
          queryKey: ['failing'],
          queryFn: async () => {
            fetchCount++
            await delay(10)
            if (failing) throw new Error('Fetch failed')
            return 'Test User'
          },
          // Keeps the failed entry cached between the fetch settling and the
          // retried render, so what is measured is the retry
          gcTime: 60_000,
        }),
      )
      return `data: ${name}`
    }
    const { rerender } = render(tree(<Consumer />))
    await waitFor(() => {
      expect(screen.getByText('error: Fetch failed')).toBeTruthy()
    })
    failing = false

    // When: The ErrorBoundary is reset together with its QueryErrorResetBoundary,
    // without clearCache
    resetErrorBoundary?.()
    rerender(tree(<Consumer />, 1))

    // Then: The hook handed the boundary on, so the query is fetched again and
    // the screen recovers
    await waitFor(() => {
      expect(screen.getByText('data: Test User')).toBeTruthy()
    })
    expect(fetchCount).toBeGreaterThan(1)
  })
})
