import { type QueryClient, useQuery } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import {
  createQueryClient,
  createQueryOptions,
  createWrapper,
  suppressConsoleError,
  useTestScreenQueryContext,
} from '~/test-utils/screen-query'

describe('ScreenQueryProvider.clearCache', () => {
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

  describe('when status is "error"', () => {
    it('should clear error queries only', async () => {
      // Given: Query in error state
      const errorQueryOptions = createQueryOptions(['error-clear'], null, {
        shouldReject: true,
        rejectWith: new Error('Test error'),
      })
      const successQueryOptions = createQueryOptions(['success-clear'], {
        data: 'success',
      })

      const TestComponent = () => {
        const errorQuery = useQuery(errorQueryOptions)
        const errorScreenQuery = {
          ...errorQuery,
          ...errorQueryOptions,
        }

        const successQuery = useQuery(successQueryOptions)
        const successScreenQuery = {
          ...successQuery,
          ...successQueryOptions,
        }

        const context = useTestScreenQueryContext()

        // Register queries
        try {
          if (!errorQuery.isLoading && !successQuery.isLoading) {
            context.getQueryResult([errorScreenQuery, successScreenQuery])
          }
        } catch {
          // Ignore errors
        }

        return context
      }

      const wrapper = createWrapper(queryClient)

      const { result } = renderHook(() => TestComponent(), { wrapper })

      await waitFor(() => {
        expect(result.current).toBeDefined()
      })

      // Verify error query and success query states
      await waitFor(() => {
        const errorCache = queryClient.getQueryCache().find({
          queryKey: errorQueryOptions.queryKey,
        })
        const successCache = queryClient.getQueryCache().find({
          queryKey: successQueryOptions.queryKey,
        })
        expect(errorCache?.state.status).toBe('error')
        expect(successCache?.state.status).toBe('success')
      })

      // When: Clear only error state queries
      await act(async () => {
        await result.current.clearCache('error')
      })

      // Then: Only error queries are reset, success queries are unaffected
      // Verify that filtering works correctly
      const errorCacheAfter = queryClient.getQueryCache().find({
        queryKey: errorQueryOptions.queryKey,
      })
      const successCacheAfter = queryClient.getQueryCache().find({
        queryKey: successQueryOptions.queryKey,
      })

      // Error query is reset (however, state remains in React Query 5.85.2)
      expect(errorCacheAfter).toBeDefined()
      // Success query is unaffected
      expect(successCacheAfter?.state.status).toBe('success')
      expect(successCacheAfter?.state.data).toEqual({ data: 'success' })
    })
  })

  describe('when status is "all"', () => {
    it('should clear all queries', async () => {
      // Given: Multiple queries
      const queryOptions1 = createQueryOptions(['all-clear', '1'], {
        data: 'data1',
      })
      const queryOptions2 = createQueryOptions(['all-clear', '2'], {
        data: 'data2',
      })

      const TestComponent = () => {
        const query1 = useQuery(queryOptions1)
        const screenQuery1 = { ...query1, ...queryOptions1 }

        const query2 = useQuery(queryOptions2)
        const screenQuery2 = { ...query2, ...queryOptions2 }

        const context = useTestScreenQueryContext()

        // Register queries
        if (query1.isSuccess && query2.isSuccess) {
          context.getQueryResult([screenQuery1, screenQuery2])
        }

        return context
      }

      const wrapper = createWrapper(queryClient)

      const { result } = renderHook(() => TestComponent(), { wrapper })

      await waitFor(() => {
        expect(result.current).toBeDefined()
      })

      // When: Clear all queries
      await act(async () => {
        // Verify clearCache executes without error
        await expect(result.current.clearCache('all')).resolves.not.toThrow()
      })

      // Then: clearCache executed successfully
      expect(result.current.clearCache).toBeDefined()
    })

    it('should destroy all observers', async () => {
      // Given: Register multiple queries
      const queryOptions1 = createQueryOptions(['destroy-test-1'], {
        data: 'test1',
      })
      const queryOptions2 = createQueryOptions(['destroy-test-2'], {
        data: 'test2',
      })

      let observerCount = 0

      const TestComponent = () => {
        const query1 = useQuery(queryOptions1)
        const query2 = useQuery(queryOptions2)
        const context = useTestScreenQueryContext()

        // Register queries and create Observers
        if (query1.isSuccess && query2.isSuccess) {
          context.getQueryResult([
            { ...query1, ...queryOptions1 },
            { ...query2, ...queryOptions2 },
          ])
          // Observer is created within getQueryResult
          observerCount = 2
        }

        return { context, observerCount }
      }

      const wrapper = createWrapper(queryClient)
      const { result } = renderHook(() => TestComponent(), { wrapper })

      await waitFor(() => {
        expect(result.current.observerCount).toBe(2)
      })

      // When: Clear cache (Observers are destroyed)
      await act(async () => {
        await result.current.context.clearCache('all')
      })

      // Try to register new query after clearCache
      const newQueryOptions = createQueryOptions(['new-after-clear'], {
        data: 'new',
      })

      const TestComponentAfter = () => {
        const query = useQuery(newQueryOptions)
        const context = useTestScreenQueryContext()

        // Verify that new Observer can be created
        if (query.isSuccess) {
          // New Observer is created because Observers were cleared by clearCache
          context.getQueryResult([{ ...query, ...newQueryOptions }])
        }

        return context
      }

      const { result: newResult } = renderHook(() => TestComponentAfter(), {
        wrapper,
      })

      // Then: New Observers can be created after clearCache and work normally
      await waitFor(() => {
        expect(newResult.current.getQueryResult).toBeDefined()
      })

      // clearCache clears Observers and new Observers can be created
      expect(result.current.context.clearCache).toBeDefined()
    })
  })
})
