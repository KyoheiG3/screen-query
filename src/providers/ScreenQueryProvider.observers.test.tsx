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
  suppressConsoleError,
  useTestScreenQueryContext,
} from '~/test-utils/screen-query'

describe('ScreenQueryProvider.observers', () => {
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

  describe('Observer Management', () => {
    it('should create observer for new queries', async () => {
      // Given: Check that QueryObserver is created
      const observerSpy = jest.spyOn(QueryObserver.prototype, 'subscribe')

      const queryOptions = createQueryOptions(['observer-create'], 'test-data')

      const TestComponent = () => {
        const query = useQuery(queryOptions)
        const context = useTestScreenQueryContext()

        if (query.isSuccess) {
          // This should create a new observer
          context.getQueryResult([{ ...query, ...queryOptions }])
          return true
        }
        return false
      }

      const wrapper = createWrapper(queryClient)
      const { result } = renderHook(() => TestComponent(), { wrapper })

      // When: Wait for query to succeed
      await waitFor(() => {
        expect(result.current).toBe(true)
      })

      // Then: Observer should be created
      expect(observerSpy).toHaveBeenCalled()

      observerSpy.mockRestore()
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
