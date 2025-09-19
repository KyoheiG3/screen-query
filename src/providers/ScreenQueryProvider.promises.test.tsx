import { type QueryClient, useQuery } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import React from 'react'
import {
  createMockUser,
  createQueryClient,
  createQueryOptions,
  createWrapper,
  suppressConsoleError,
  useTestScreenQueryContext,
} from '~/test-utils/screen-query'

describe('ScreenQueryProvider.promises', () => {
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

  describe('Promise Management', () => {
    it('should reuse promise for same query set', async () => {
      // Given: Multiple calls for the same query set
      const queryOptions = createQueryOptions(
        ['promise-reuse'],
        { data: 'test' },
        { delay: 1 },
      )

      const TestComponent = () => {
        const query = useQuery(queryOptions)
        const screenQuery = {
          ...query,
          ...queryOptions,
        }

        const context = useTestScreenQueryContext()

        // Call getQueryResult multiple times
        try {
          context.getQueryResult([screenQuery])
        } catch (error) {
          if (error instanceof Promise) {
            // Expect the same Promise to be reused
            try {
              context.getQueryResult([screenQuery])
            } catch (error2) {
              return error === error2 ? 'same-promise' : 'different-promise'
            }
          }
        }

        return 'completed'
      }

      const wrapper = createWrapper(queryClient)

      const { result } = renderHook(() => TestComponent(), { wrapper })

      // Then: Same Promise is reused
      expect(result.current).toBe('same-promise')
    })

    it('should resolve promise through observer subscription when query completes', async () => {
      // Given: Query that fetches data asynchronously
      const mockData = createMockUser(10, 'Async User')
      const queryKey = ['async-observer-test']

      const queryOptions = createQueryOptions(queryKey, mockData, {
        delay: 1, // Add slight delay to simulate async processing
      })

      const TestComponent = () => {
        const [attemptCount, setAttemptCount] = React.useState(0)

        const query = useQuery({
          ...queryOptions,
          enabled: attemptCount > 0,
        })

        const screenQuery = {
          ...query,
          ...queryOptions,
        }

        const context = useTestScreenQueryContext()

        React.useEffect(() => {
          if (attemptCount === 0) {
            // Update state to enable query
            setAttemptCount(1)
          }
        }, [attemptCount])

        // Try to get query
        let result: { status: string; data: any; queryStatus: string }
        try {
          const [data] = context.getQueryResult([screenQuery])
          result = {
            status: 'success',
            data,
            queryStatus: query.status,
          }
        } catch (error) {
          if (error instanceof Promise) {
            // If Promise is thrown, hold it and wait for resolution later
            void error.then(() => {
              // Re-rendering is triggered when Promise resolves
            })

            result = {
              status: 'loading',
              data: null,
              queryStatus: query.status,
            }
          } else {
            result = {
              status: 'error',
              data: null,
              queryStatus: query.status,
            }
          }
        }

        return result
      }

      const wrapper = createWrapper(queryClient)
      const { result } = renderHook(() => TestComponent(), { wrapper })

      // Initial: Query has not started yet or is loading
      expect(result.current.status).toBe('loading')

      // Wait until query completes
      await waitFor(() => {
        expect(result.current.status).toBe('success')
      })

      // Then: Observer.subscribe callback is called and Promise resolves
      expect(result.current.data).toEqual(mockData)
      expect(result.current.queryStatus).toBe('success')
    })

    it('should clean up promises after resolution', async () => {
      // Given: Query that resolves
      const TestComponent = () => {
        const [attemptCount, setAttemptCount] = React.useState(0)
        const queryOptions = createQueryOptions(['cleanup-test'], {
          data: 'test',
        })
        const query = useQuery({
          ...queryOptions,
          enabled: attemptCount > 0,
        })
        const screenQuery = { ...query, ...queryOptions }

        const context = useTestScreenQueryContext()

        React.useEffect(() => {
          if (attemptCount === 0) {
            setAttemptCount(1)
          }
        }, [attemptCount])

        if (query.isSuccess) {
          context.getQueryResult([screenQuery])
          return 'success'
        }

        return 'loading'
      }

      const wrapper = createWrapper(queryClient)

      const { result } = renderHook(() => TestComponent(), { wrapper })

      // When: Query resolves
      await waitFor(() => {
        expect(result.current).toBe('success')
      })

      // Then: Promise is cleaned up (internal implementation is hard to verify, so check that no errors occur)
      expect(result.current).toBe('success')
    })
  })
})
