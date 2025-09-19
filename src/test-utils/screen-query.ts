import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import {
  ScreenQueryContext,
  ScreenQueryProvider,
} from '~/providers/ScreenQueryProvider'

/**
 * Create QueryClient for testing
 */
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  })
}

/**
 * Create wrapper component for testing with ScreenQueryProvider
 */
export function createWrapper(queryClient: QueryClient) {
  // eslint-disable-next-line react/display-name
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(ScreenQueryProvider, null, children),
    )
}

/**
 * Create wrapper component with only QueryClientProvider (no ScreenQueryProvider)
 */
export function createQueryClientWrapper(queryClient: QueryClient) {
  // eslint-disable-next-line react/display-name
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children,
    )
}

/**
 * Mock data generator function
 */
export function createMockData<T extends Record<string, unknown>>(data: T) {
  return data
}

/**
 * Generate mock user data
 */
export function createMockUser(id = 1, name = 'Test User') {
  return {
    id,
    name,
  }
}

/**
 * Generate query options
 */
export function createQueryOptions<T>(
  key: string[],
  data?: T,
  options?: {
    shouldReject?: boolean
    rejectWith?: Error
    delay?: number
    isPending?: boolean
    staleTime?: number
    initialData?: T
    placeholderData?: T
  },
) {
  const queryKey = Array.isArray(key) ? key : [key]
  const {
    shouldReject = false,
    rejectWith = new Error('Query failed'),
    delay = 0,
    isPending = false,
    staleTime,
    initialData,
    placeholderData,
  } = options || {}

  let queryFn: () => Promise<T>

  if (isPending) {
    queryFn = () => new Promise(() => {}) // Permanently pending
  } else if (shouldReject) {
    queryFn = () => Promise.reject(rejectWith)
  } else {
    queryFn = async () => {
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
      return data as T
    }
  }

  return {
    queryKey,
    queryFn,
    ...(staleTime !== undefined && { staleTime }),
    ...(initialData !== undefined && { initialData }),
    ...(placeholderData !== undefined && { placeholderData }),
  }
}

/**
 * Helper to get ScreenQueryContext
 * Throws error if context doesn't exist
 */
export function useTestScreenQueryContext() {
  const context = React.useContext(ScreenQueryContext)
  if (!context) throw new Error('Context not found')
  return context
}

/**
 * Delay helper
 */
export function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Suppress console.error for intentional error tests and React 18 warnings
 * Returns a spy instance that can be restored with mockRestore()
 */
export function suppressConsoleError(): jest.SpyInstance {
  return jest.spyOn(console, 'error').mockImplementation(() => {
    // Suppress all console.error outputs including React 18 Suspense warnings
  })
}
