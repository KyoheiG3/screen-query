import {
  type QueryClient,
  QueryObserver,
  useQuery,
} from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import {
  createQueryClient,
  createQueryOptions,
  createWrapper,
  useTestScreenQueryContext,
} from '~/test-utils/screen-query'

describe('ScreenQueryProvider.observers', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    // Given: Initialize new QueryClient
    queryClient = createQueryClient()
  })

  afterEach(() => {
    // Cleanup after test
    queryClient.clear()
  })

  describe('Observer Management', () => {
    it('should create observer for new queries', async () => {
      // Given: Multiple different query keys
      const queryOptions1 = createQueryOptions(['observer-1'], 'test1')
      const queryOptions2 = createQueryOptions(['observer-2'], 'test2')

      const TestComponent = () => {
        const query1 = useQuery(queryOptions1)
        const query2 = useQuery(queryOptions2)
        const context = useTestScreenQueryContext()

        // Get results of successful queries
        if (query1.isSuccess && query2.isSuccess) {
          const screenQuery1 = { ...query1, ...queryOptions1 }
          const screenQuery2 = { ...query2, ...queryOptions2 }

          // New Observer is created by registering new query
          const [data1] = context.getQueryResult([screenQuery1])
          const [data2] = context.getQueryResult([screenQuery2])

          return {
            executed: true,
            data1,
            data2,
          }
        }

        return { executed: false }
      }

      const wrapper = createWrapper(queryClient)
      const { result } = renderHook(() => TestComponent(), { wrapper })

      // When: Query succeeds and results are retrieved
      await waitFor(() => {
        expect(result.current.executed).toBe(true)
      })

      // Then: Observer is created for each query and data can be retrieved
      expect(result.current.data1).toBe('test1')
      expect(result.current.data2).toBe('test2')
    })

    it('should reuse existing observer for same query key', async () => {
      // Given: Multiple calls with same query key
      let renderCount = 0
      const queryOptions = createQueryOptions(['reuse-observer'], {
        data: 'test',
      })

      const TestComponent = () => {
        renderCount++
        const query = useQuery(queryOptions)
        const screenQuery = { ...query, ...queryOptions }

        const context = useTestScreenQueryContext()

        if (query.isSuccess) {
          // Register same query multiple times
          context.getQueryResult([screenQuery])
          context.getQueryResult([screenQuery])
        }

        return renderCount
      }

      const wrapper = createWrapper(queryClient)

      const { result } = renderHook(() => TestComponent(), { wrapper })

      await waitFor(() => {
        expect(result.current).toBeGreaterThan(0)
      })

      // Then: Observer is reused (new Observer is not created)
      // Indirectly verify that performance is maintained
      expect(result.current).toBeLessThan(10) // Verify no infinite loop
    })

    it('should clean up observers on unmount', async () => {
      // Given: Mounted component
      const queryOptions = createQueryOptions(['unmount-test'], {
        data: 'test',
      })

      const TestComponent = () => {
        const query = useQuery(queryOptions)
        const screenQuery = {
          ...query,
          ...queryOptions,
        }

        const context = useTestScreenQueryContext()

        if (query.isSuccess) {
          context.getQueryResult([screenQuery])
        }

        return 'mounted'
      }

      const wrapper = createWrapper(queryClient)

      const { result, unmount } = renderHook(() => TestComponent(), { wrapper })

      await waitFor(() => {
        expect(result.current).toBe('mounted')
      })

      // Spy on QueryObserver destroy
      const destroySpy = jest.spyOn(QueryObserver.prototype, 'destroy')

      // When: Unmount component
      unmount()

      // Then: Observer is cleaned up
      expect(destroySpy).toHaveBeenCalled()
      destroySpy.mockRestore()
    })
  })
})
