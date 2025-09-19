import { type QueryClient } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import {
  createQueryClient,
  createQueryClientWrapper,
  createWrapper,
  suppressConsoleError,
} from '~/test-utils/screen-query'
import { useScreenQueryContext } from './useScreenQueryContext'

/**
 * Helper to safely catch and return errors
 * @param fn - Function to execute
 * @returns Caught Error, or null if no error
 */
const catchError = <T = void>(fn: () => T) => {
  try {
    fn()
    return null
  } catch (error) {
    if (error instanceof Error) {
      return error
    }
    // Wrap with Error if non-Error value is thrown
    return new Error(String(error))
  }
}

describe('useScreenQueryContext', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = createQueryClient()
  })

  describe('when used within ScreenQueryProvider', () => {
    it('should return context value with all required functions', () => {
      // Given: Environment wrapped with ScreenQueryProvider
      const wrapper = createWrapper(queryClient)

      // When: Use hook
      const { result } = renderHook(() => useScreenQueryContext(), { wrapper })

      // Then: All required functions are provided
      expect(result.current).toBeDefined()
      expect(result.current.getQueryResult).toBeInstanceOf(Function)
      expect(result.current.refetchQueries).toBeInstanceOf(Function)
      expect(result.current.clearCache).toBeInstanceOf(Function)
    })

    it('should maintain stable function references across re-renders', () => {
      // Given: Environment wrapped with ScreenQueryProvider
      const wrapper = createWrapper(queryClient)

      // When: Use hook and re-render
      const { result, rerender } = renderHook(
        () => useScreenQueryContext(),
        { wrapper },
      )

      const firstContext = result.current
      rerender()
      const secondContext = result.current

      // Then: Function references are stable
      expect(firstContext.getQueryResult).toBe(secondContext.getQueryResult)
      expect(firstContext.refetchQueries).toBe(secondContext.refetchQueries)
      expect(firstContext.clearCache).toBe(secondContext.clearCache)
    })

    it('should provide properly typed context value', () => {
      // Given: Environment wrapped with ScreenQueryProvider
      const wrapper = createWrapper(queryClient)

      // When: Use hook for type checking
      const { result } = renderHook(() => {
        const context = useScreenQueryContext()
        return context
      }, { wrapper })

      // Then: Types are correctly defined
      expect(result.current).toBeDefined()
      expect(result.current).toHaveProperty('getQueryResult')
      expect(result.current).toHaveProperty('refetchQueries')
      expect(result.current).toHaveProperty('clearCache')
    })
  })

  describe('when used outside ScreenQueryProvider', () => {
    beforeEach(() => {
      // Suppress console.error for these error tests
      suppressConsoleError()
    })

    afterEach(() => {
      jest.restoreAllMocks()
    })

    it('should throw error with QueryClientProvider only', () => {
      // Given: No ScreenQueryProvider, only QueryClientProvider
      const wrapper = createQueryClientWrapper(queryClient)

      // When: Use hook
      const error = catchError(() => {
        renderHook(() => useScreenQueryContext(), { wrapper })
      })

      // Then: Appropriate error message
      expect(error).not.toBeNull()
      expect(error?.message).toBe(
        'ScreenQueryContext must be used within ScreenQueryProvider',
      )
    })

    it('should throw error without any provider', () => {
      // Given: No provider
      // When: Use hook
      const error = catchError(() => {
        renderHook(() => useScreenQueryContext())
      })

      // Then: Appropriate error message
      expect(error).not.toBeNull()
      expect(error?.message).toBe(
        'ScreenQueryContext must be used within ScreenQueryProvider',
      )
    })

    it('should provide clear error message for debugging', () => {
      // Given: Use outside Provider
      const { result } = renderHook(() => {
        try {
          return useScreenQueryContext()
        } catch (error) {
          if (error instanceof Error) {
            return error.message
          }
          throw error
        }
      })

      // Then: Clear message helpful for debugging
      expect(result.current).toBe(
        'ScreenQueryContext must be used within ScreenQueryProvider',
      )
    })
  })
})
