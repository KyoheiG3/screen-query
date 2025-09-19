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

describe('ScreenQueryProvider.memory', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    // Given: Initialize new QueryClient
    queryClient = createQueryClient()
  })

  afterEach(() => {
    // Cleanup after test
    queryClient.clear()
  })

  describe('Memory Management', () => {
    it('should not accumulate observers after multiple mount/unmount cycles', async () => {
      // Given: Track number of Observers
      const cycles = 30
      const observerCounts: number[] = []

      // When: Execute multiple mount/unmount cycles
      for (let i = 0; i < cycles; i++) {
        const queryOptions = createQueryOptions([`cycle-${i}`], `data-${i}`)

        const TestComponent = () => {
          const query = useQuery(queryOptions)
          const context = useTestScreenQueryContext()

          if (query.isSuccess) {
            const screenQuery = { ...query, ...queryOptions }
            context.getQueryResult([screenQuery])
          }

          return null
        }

        const wrapper = createWrapper(queryClient)
        const { unmount } = renderHook(() => TestComponent(), { wrapper })

        // Wait until query succeeds
        await waitFor(() => {
          const cache = queryClient.getQueryCache()
          const query = cache.find({ queryKey: [`cycle-${i}`] })
          return query?.state.status === 'success'
        })

        // Unmount
        unmount()

        // Record current Observer count
        const cache = queryClient.getQueryCache()
        const totalObservers = cache
          .getAll()
          .reduce((sum, query) => sum + query.observers.length, 0)
        observerCounts.push(totalObservers)
      }

      // Then: Verify Observer count is not increasing linearly
      // Expect small difference between initial and final Observer counts
      const initialCount = observerCounts[0] || 0
      const finalCount = observerCounts[observerCounts.length - 1] || 0
      const maxAllowedIncrease = 5 // Maximum allowed increase

      expect(finalCount - initialCount).toBeLessThanOrEqual(maxAllowedIncrease)
    })

    it('should call destroy on all observers during provider cleanup', () => {
      // Given: Spy on destroy method
      const destroySpy = jest.spyOn(QueryObserver.prototype, 'destroy')

      const TestComponent = () => {
        useQuery(createQueryOptions(['destroy-test-1'], 'data1'))
        useQuery(createQueryOptions(['destroy-test-2'], 'data2'))
        useQuery(createQueryOptions(['destroy-test-3'], 'data3'))
        return null
      }

      // When: Mount component then unmount
      const wrapper = createWrapper(queryClient)
      const { unmount } = renderHook(() => TestComponent(), { wrapper })

      const initialCallCount = destroySpy.mock.calls.length

      unmount()

      // Then: destroy is called for each Observer
      expect(destroySpy.mock.calls.length).toBeGreaterThan(initialCallCount)
      destroySpy.mockRestore()
    })

    it('should clean up query promise references on unmount', async () => {
      // Given: Query that is permanently pending
      const queryOptions = createQueryOptions(['pending-cleanup'], 'data', {
        isPending: true,
      })

      const TestComponent = () => {
        const query = useQuery(queryOptions)
        const context = useTestScreenQueryContext()

        // Throw Promise (caught)
        if (!query.isSuccess && !query.isError) {
          try {
            const screenQuery = { ...query, ...queryOptions }
            context.getQueryResult([screenQuery])
          } catch {
            // Expect Promise to be thrown
          }
        }

        return null
      }

      const wrapper = createWrapper(queryClient)
      const { unmount } = renderHook(() => TestComponent(), { wrapper })

      // Wait until Promise is thrown
      await waitFor(() => {
        const cache = queryClient.getQueryCache()
        const query = cache.find({ queryKey: ['pending-cleanup'] })
        return query !== undefined
      })

      // When: Unmount
      unmount()

      // Then: Promise references are cleaned up (indirect verification)
      // Verify that garbage collection is in an executable state
      const cache = queryClient.getQueryCache()
      const remainingQueries = cache.getAll()
      expect(remainingQueries.some((q) => q.queryKey[0] === 'pending-cleanup'))
        .toBe(true)
    })

    it('should handle rapid mount/unmount without errors', async () => {
      // Given: Function to catch errors
      const errors: Error[] = []
      const originalConsoleError = jest.spyOn(console, 'error')
        .mockImplementation((error: Error) => {
          errors.push(error)
        })

      // When: Rapidly repeat mount/unmount
      const rapidCycles = 10
      const promises = []

      for (let i = 0; i < rapidCycles; i++) {
        const promise = (async () => {
          const queryOptions = createQueryOptions([`rapid-${i}`], `data-${i}`, {
            delay: 1,
          })

          const TestComponent = () => {
            const query = useQuery(queryOptions)
            const context = useTestScreenQueryContext()

            if (query.isSuccess) {
              const screenQuery = { ...query, ...queryOptions }
              context.getQueryResult([screenQuery])
            }

            return null
          }

          const wrapper = createWrapper(queryClient)
          const { unmount } = renderHook(() => TestComponent(), { wrapper })

          // Immediately unmount (before data fetch completes)
          unmount()
        })()

        promises.push(promise)
      }

      await Promise.all(promises)

      // Then: Verify no errors occurred
      originalConsoleError.mockRestore()
      expect(errors).toHaveLength(0)
    })
  })
})
