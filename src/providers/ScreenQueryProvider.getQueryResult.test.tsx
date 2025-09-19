import { type QueryClient, useQuery } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import {
  createMockData,
  createMockUser,
  createQueryClient,
  createQueryOptions,
  createWrapper,
  useTestScreenQueryContext,
} from '~/test-utils/screen-query'

describe('ScreenQueryProvider.getQueryResult', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    // Given: Initialize new QueryClient
    queryClient = createQueryClient()
  })

  afterEach(() => {
    // Cleanup after test
    queryClient.clear()
  })

  describe('when query is successful', () => {
    it('should return data', async () => {
      // Given: Prepare successful query
      const mockData = createMockUser()
      const queryOptions = createQueryOptions(['test'], mockData)

      const TestComponent = () => {
        const query = useQuery(queryOptions)
        const screenQuery = {
          ...query,
          ...queryOptions,
        }

        const context = useTestScreenQueryContext()

        // When: Call getQueryResult (handle Promise with try-catch)
        try {
          const [data] = context.getQueryResult([screenQuery])
          return { status: 'success', data: data.name }
        } catch (error) {
          if (error instanceof Promise) {
            // Catch Promise on initial rendering
            void error.then(() => {})
            return { status: 'loading' }
          }
          return { status: 'error', error }
        }
      }

      const wrapper = createWrapper(queryClient)

      // Then: Data is returned correctly
      const { result } = renderHook(() => TestComponent(), { wrapper })

      // Initial state is loading
      expect(result.current.status).toBe('loading')

      // Success state after data retrieval
      await waitFor(() => {
        expect(result.current.status).toBe('success')
      })
      expect(result.current.data).toBe(mockData.name)
    })

    it('should handle multiple queries synchronously', async () => {
      // Given: Multiple successful queries
      const mockData1 = createMockData({ id: 1, value: 'first' })
      const mockData2 = createMockData({ id: 2, value: 'second' })
      const queryOptions1 = createQueryOptions(['multi', '1'], mockData1)
      const queryOptions2 = createQueryOptions(['multi', '2'], mockData2)

      const TestComponent = () => {
        const query1 = useQuery(queryOptions1)
        const query2 = useQuery(queryOptions2)

        const context = useTestScreenQueryContext()

        // When: Get multiple queries simultaneously (handle Promise with try-catch)
        try {
          const [data1, data2] = context.getQueryResult([
            { ...query1, ...queryOptions1 },
            { ...query2, ...queryOptions2 },
          ])

          // Then: Both data are returned correctly
          type MockDataType = {
            id: number
            value: string
          }
          return {
            status: 'success',
            data: {
              first: (data1 as MockDataType).value,
              second: (data2 as MockDataType).value,
            },
          }
        } catch (error) {
          if (error instanceof Promise) {
            // Catch Promise on initial rendering
            void error.then(() => {})
            return { status: 'loading' }
          }
          return { status: 'error', error }
        }
      }

      const wrapper = createWrapper(queryClient)

      const { result } = renderHook(() => TestComponent(), { wrapper })

      // Initial state is loading
      expect(result.current.status).toBe('loading')

      // Success state after data retrieval
      await waitFor(() => {
        expect(result.current.status).toBe('success')
      })
      expect(result.current.data).toEqual({
        first: 'first',
        second: 'second',
      })
    })
  })

  describe('when data is cached or has initial data', () => {
    it('should throw promise on first render even with cached data, then return data on re-render', async () => {
      // Given: Pre-set data in cache
      const mockData = createMockUser(1, 'Cached User')
      const queryKey = ['cached-test']

      // Set cache in advance
      queryClient.setQueryData(queryKey, mockData)

      let renderCount = 0
      const queryOptions = createQueryOptions(queryKey, mockData, {
        staleTime: Infinity, // Always keep data fresh
      })

      const TestComponent = () => {
        renderCount++
        const query = useQuery(queryOptions)

        const screenQuery = {
          ...query,
          ...queryOptions,
        }

        const context = useTestScreenQueryContext()

        try {
          const [data] = context.getQueryResult([screenQuery])
          return {
            renderCount,
            data,
            threwPromise: false,
          }
        } catch (error) {
          if (error instanceof Promise) {
            // Wait asynchronously to resolve Promise
            void error.then(() => {})
            return {
              renderCount,
              data: null,
              threwPromise: true,
            }
          }
          throw error
        }
      }

      const wrapper = createWrapper(queryClient)

      const { result, rerender } = renderHook(() => TestComponent(), {
        wrapper,
      })

      // Then: Promise is thrown on initial rendering (new Observer is created even with cache)
      expect(result.current.renderCount).toBe(1)
      expect(result.current.threwPromise).toBe(true)
      expect(result.current.data).toBeNull()

      // Manually trigger re-rendering
      await act(async () => {
        rerender()
      })

      // Then: Cache data is returned on re-rendering
      expect(result.current.renderCount).toBe(2)
      expect(result.current.threwPromise).toBe(false)
      expect(result.current.data).toEqual(mockData)
    })

    it('should throw promise on first render with initialData, then return data on re-render', async () => {
      // Given: Query with initialData
      const initialData = createMockUser(2, 'Initial User')
      const fetchedData = createMockUser(3, 'Fetched User')

      let renderCount = 0
      const queryOptions = createQueryOptions(
        ['initial-data-test'],
        fetchedData,
        {
          delay: 1, // Delay fetch so initialData is used first
          initialData,
          staleTime: 0, // Mark data as stale immediately to allow refetch
        },
      )

      const TestComponent = () => {
        renderCount++
        const query = useQuery(queryOptions)

        const screenQuery = {
          ...query,
          ...queryOptions,
        }

        const context = useTestScreenQueryContext()

        try {
          const [data] = context.getQueryResult([screenQuery])
          return {
            renderCount,
            data,
            threwPromise: false,
            isSuccess: query.isSuccess,
            isFetching: query.isFetching,
          }
        } catch (error) {
          if (error instanceof Promise) {
            void error.then(() => {})
            return {
              renderCount,
              data: null,
              threwPromise: true,
              isSuccess: query.isSuccess,
              isFetching: query.isFetching,
            }
          }
          throw error
        }
      }

      const wrapper = createWrapper(queryClient)

      const { result, rerender } = renderHook(() => TestComponent(), {
        wrapper,
      })

      // Then: Promise is thrown on initial rendering (even with initial data)
      expect(result.current.renderCount).toBe(1)
      expect(result.current.threwPromise).toBe(true)

      // Manually trigger re-rendering (initial data becomes available)
      await act(async () => {
        rerender()
      })

      // Then: initialData is returned on re-rendering (fetch is not complete yet)
      expect(result.current.renderCount).toBe(2)
      expect(result.current.threwPromise).toBe(false)
      expect(result.current.isSuccess).toBe(true)
      expect(result.current.data).toEqual(initialData)
    })

    it('should throw promise on first render with placeholderData, then return data on re-render', async () => {
      // Given: Query with placeholderData
      const placeholderData = createMockUser(4, 'Placeholder User')
      const realData = createMockUser(5, 'Real User')

      let renderCount = 0
      const queryOptions = createQueryOptions(
        ['placeholder-test'],
        realData,
        {
          delay: 1, // Delay fetch so placeholderData is used first
          placeholderData,
        },
      )

      const TestComponent = () => {
        renderCount++
        const query = useQuery(queryOptions)

        const screenQuery = {
          ...query,
          ...queryOptions,
        }

        const context = useTestScreenQueryContext()

        try {
          const [data] = context.getQueryResult([screenQuery])
          return {
            renderCount,
            data,
            threwPromise: false,
            isPlaceholderData: query.isPlaceholderData,
            isFetching: query.isFetching,
          }
        } catch (error) {
          if (error instanceof Promise) {
            void error.then(() => {})
            return {
              renderCount,
              data: null,
              threwPromise: true,
              isPlaceholderData: query.isPlaceholderData,
              isFetching: query.isFetching,
            }
          }
          throw error
        }
      }

      const wrapper = createWrapper(queryClient)

      const { result, rerender } = renderHook(() => TestComponent(), {
        wrapper,
      })

      // Then: Promise is thrown on initial rendering (even with placeholderData)
      expect(result.current.renderCount).toBe(1)
      expect(result.current.threwPromise).toBe(true)

      // Manually trigger re-rendering (placeholderData becomes available)
      await act(async () => {
        rerender()
      })

      // Then: placeholderData is returned on re-rendering (fetch is not complete yet)
      expect(result.current.renderCount).toBe(2)
      expect(result.current.threwPromise).toBe(false)
      expect(result.current.isPlaceholderData).toBe(true)
      expect(result.current.isFetching).toBe(true)
      expect(result.current.data).toEqual(placeholderData)
    })
  })

  describe('when queries are loading', () => {
    it('should throw promise', () => {
      // Given: Loading query
      const queryOptions = createQueryOptions(['loading-test'], null, {
        isPending: true,
      })

      const TestComponent = () => {
        const query = useQuery(queryOptions)
        const screenQuery = {
          ...query,
          ...queryOptions,
        }

        const context = useTestScreenQueryContext()

        // When: Call getQueryResult
        try {
          context.getQueryResult([screenQuery])
          return 'should not reach here'
        } catch (error) {
          // Then: Promise is thrown
          if (error instanceof Promise) {
            return 'promise thrown'
          }
          throw error
        }
      }

      const wrapper = createWrapper(queryClient)

      const { result } = renderHook(() => TestComponent(), { wrapper })
      expect(result.current).toBe('promise thrown')
    })

    it('should throw promise when at least one query is loading even if others have data', async () => {
      // Given: One successful query and one loading query
      const successData = createMockUser(1, 'Success User')
      const successKey = ['success-query']

      // Pre-set data for successful query in cache
      queryClient.setQueryData(successKey, successData)

      const successQueryOptions = {
        queryKey: successKey,
        queryFn: () => Promise.resolve(successData),
        staleTime: Infinity,
      }

      const loadingQueryOptions = createQueryOptions(
        ['loading-query'],
        null,
        {
          isPending: true,
        },
      )

      let renderCount = 0
      const TestComponent = () => {
        renderCount++
        const successQuery = useQuery(successQueryOptions)
        const loadingQuery = useQuery(loadingQueryOptions)

        const context = useTestScreenQueryContext()

        // Try to get both queries simultaneously
        try {
          const [data1, data2] = context.getQueryResult([
            { ...successQuery, queryKey: successKey },
            { ...loadingQuery, ...loadingQueryOptions },
          ])
          return {
            renderCount,
            status: 'data-returned',
            data1,
            data2,
            successStatus: successQuery.status,
            loadingStatus: loadingQuery.status,
          }
        } catch (error) {
          if (error instanceof Promise) {
            void error.then(() => {})
            return {
              renderCount,
              status: 'promise-thrown',
              data1: null,
              data2: null,
              successStatus: successQuery.status,
              loadingStatus: loadingQuery.status,
            }
          }
          throw error
        }
      }

      const wrapper = createWrapper(queryClient)
      const { result, rerender } = renderHook(() => TestComponent(), {
        wrapper,
      })

      // Initial rendering: Promise is thrown because new Observer is created
      expect(result.current.renderCount).toBe(1)
      expect(result.current.status).toBe('promise-thrown')

      // Trigger re-rendering
      await act(async () => {
        rerender()
      })

      // Then: Promise is thrown if one query is successful but another is loading
      expect(result.current.renderCount).toBe(2)
      expect(result.current.status).toBe('promise-thrown')
      expect(result.current.successStatus).toBe('success')
      expect(result.current.loadingStatus).toBe('pending')
    })

    it('should throw promise with multiple queries when any is loading', async () => {
      // Given: 3 queries (2 successful, 1 loading)
      const data1 = createMockData({ id: 1, value: 'First' })
      const data2 = createMockData({ id: 2, value: 'Second' })
      const key1 = ['multi-1']
      const key2 = ['multi-2']

      // Pre-set data for two queries in cache
      queryClient.setQueryData(key1, data1)
      queryClient.setQueryData(key2, data2)

      const query1Options = {
        queryKey: key1,
        queryFn: () => Promise.resolve(data1),
        staleTime: Infinity,
      }
      const query2Options = {
        queryKey: key2,
        queryFn: () => Promise.resolve(data2),
        staleTime: Infinity,
      }
      const query3Options = createQueryOptions(['multi-3'], null, {
        isPending: true, // Permanently in loading state
      })

      let renderCount = 0
      const TestComponent = () => {
        renderCount++
        const query1 = useQuery(query1Options)
        const query2 = useQuery(query2Options)
        const query3 = useQuery(query3Options)

        const context = useTestScreenQueryContext()

        const queries = [
          { ...query1, queryKey: key1 },
          { ...query2, queryKey: key2 },
          { ...query3, ...query3Options },
        ]

        try {
          const results = context.getQueryResult(queries)
          return {
            renderCount,
            threwPromise: false,
            dataReceived: results.length,
            statuses: [query1.status, query2.status, query3.status],
          }
        } catch (error) {
          if (error instanceof Promise) {
            void error.then(() => {})
            return {
              renderCount,
              threwPromise: true,
              dataReceived: 0,
              statuses: [query1.status, query2.status, query3.status],
            }
          }
          throw error
        }
      }

      const wrapper = createWrapper(queryClient)
      const { result, rerender } = renderHook(() => TestComponent(), {
        wrapper,
      })

      // Initial rendering
      expect(result.current.renderCount).toBe(1)
      expect(result.current.threwPromise).toBe(true)

      // Trigger re-rendering
      await act(async () => {
        rerender()
      })

      // Then: Promise is thrown if multiple queries are successful but even one is loading
      expect(result.current.renderCount).toBe(2)
      expect(result.current.threwPromise).toBe(true)
      expect(result.current.dataReceived).toBe(0)
      expect(result.current.statuses).toEqual([
        'success',
        'success',
        'pending',
      ])
    })
  })

  describe('when query fails', () => {
    it('should throw error', async () => {
      // Given: Query that returns error
      const mockError = new Error('Query failed')

      const queryOptions = createQueryOptions(['error-test'], undefined, {
        shouldReject: true,
        rejectWith: mockError,
      })

      const TestComponent = () => {
        const query = useQuery(queryOptions)

        const screenQuery = {
          ...query,
          ...queryOptions,
        }

        const context = useTestScreenQueryContext()

        // Wait while loading
        if (query.isLoading) {
          return 'loading'
        }

        // Process when in error state
        if (query.isError) {
          try {
            context.getQueryResult([screenQuery])
            return 'should not reach here'
          } catch {
            return 'error thrown'
          }
        }

        return 'waiting'
      }

      const wrapper = createWrapper(queryClient)

      const { result } = renderHook(() => TestComponent(), { wrapper })

      await waitFor(() => {
        expect(result.current).toBe('error thrown')
      })
    })
  })
})
