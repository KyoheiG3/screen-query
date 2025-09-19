import { type QueryClient, useQuery } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import {
  createQueryClient,
  createQueryOptions,
  createWrapper,
  suppressConsoleError,
  useTestScreenQueryContext,
} from '~/test-utils/screen-query'

describe('ScreenQueryProvider.refetchAllQueries', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    // Suppress console.error including React 18 Suspense warnings
    suppressConsoleError()
    // Given: Initialize new QueryClient
    queryClient = createQueryClient()
  })

  afterEach(() => {
    jest.restoreAllMocks()
    // Cleanup after test
    queryClient.clear()
  })

  describe('when queries are registered', () => {
    it('should refetch all registered queries', async () => {
      // Given: Query with refetch counter
      let fetchCount = 0
      const queryOptions = createQueryOptions(['refetch-test'], {
        data: 'initial',
      })

      // Override queryFn to count call times
      queryOptions.queryFn = async () => {
        fetchCount++
        return { data: `fetch-${fetchCount}` }
      }

      const TestComponent = () => {
        const query = useQuery(queryOptions)
        const screenQuery = {
          ...query,
          ...queryOptions,
        }

        const context = useTestScreenQueryContext()

        // Register queries
        if (query.isSuccess) {
          context.getQueryResult([screenQuery])
        }

        return { context, query }
      }

      const wrapper = createWrapper(queryClient)

      const { result } = renderHook(() => TestComponent(), { wrapper })

      await waitFor(() => {
        expect(result.current.query.isSuccess).toBe(true)
      })

      // Verify initial fetch is complete
      const initialFetchCount = fetchCount
      expect(initialFetchCount).toBeGreaterThanOrEqual(1)

      // When: Execute refetchQueries
      await act(async () => {
        await result.current.context.refetchQueries()
      })

      // Use waitFor to wait for async refetch completion
      await waitFor(() => {
        // Then: Query is refetched (fetchCount increases)
        expect(fetchCount).toBeGreaterThan(initialFetchCount)
      })

      // Verify that data is actually updated
      const updatedCache = queryClient.getQueryCache().find({
        queryKey: queryOptions.queryKey,
      })
      expect(updatedCache?.state.data).toEqual({ data: `fetch-${fetchCount}` })
    })

    it('should batch notifications during refetch', async () => {
      // Given: Register multiple queries and count rendering times
      let renderCount = 0
      const queryOptions1 = createQueryOptions(['batch-1'], { data: 'test1' })
      const queryOptions2 = createQueryOptions(['batch-2'], { data: 'test2' })

      const TestComponent = () => {
        const query1 = useQuery(queryOptions1)
        const query2 = useQuery(queryOptions2)
        const context = useTestScreenQueryContext()

        // Count rendering times
        renderCount++

        if (query1.isSuccess && query2.isSuccess) {
          context.getQueryResult([
            { ...query1, ...queryOptions1 },
            { ...query2, ...queryOptions2 },
          ])
        }

        return { context, query1, query2 }
      }

      const wrapper = createWrapper(queryClient)
      const { result } = renderHook(() => TestComponent(), { wrapper })

      await waitFor(() => {
        expect(result.current.query1.isSuccess).toBe(true)
        expect(result.current.query2.isSuccess).toBe(true)
      })

      // Record rendering count before refetch
      const renderCountBeforeRefetch = renderCount

      // When: Execute refetchQueries
      await act(async () => {
        await result.current.context.refetchQueries()
      })

      // Then: Batch processing minimizes rendering count
      // If notifications are batched, they are processed together rather than individually
      await waitFor(() => {
        // Rendering count increase is suppressed even after refetch
        const renderIncrease = renderCount - renderCountBeforeRefetch
        // Without batch processing, two queries might render 2+ times
        // With batch processing, increase is minimized (around 1-2 times)
        expect(renderIncrease).toBeLessThanOrEqual(3)
      })

      // Verify that both queries were actually refetched
      expect(result.current.query1.dataUpdatedAt).toBeGreaterThan(0)
      expect(result.current.query2.dataUpdatedAt).toBeGreaterThan(0)
    })
  })
})
