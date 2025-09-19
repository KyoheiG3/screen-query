import { type QueryClient } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import React from 'react'
import {
  createQueryClient,
  createWrapper,
  useTestScreenQueryContext,
} from '~/test-utils/screen-query'
import { ScreenQueryContext } from './ScreenQueryProvider'

describe('ScreenQueryProvider', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    // Given: Initialize new QueryClient
    queryClient = createQueryClient()
  })

  afterEach(() => {
    // Cleanup after test
    queryClient.clear()
  })

  describe('Provider Registration', () => {
    it('should provide context value with required functions', () => {
      // Given: Component wrapped with ScreenQueryProvider
      const wrapper = createWrapper(queryClient)

      // When: Get context
      const { result } = renderHook(
        () => useTestScreenQueryContext(),
        { wrapper },
      )

      // Then: Required functions are provided
      expect(result.current).toBeDefined()
      expect(result.current?.getQueryResult).toBeInstanceOf(Function)
      expect(result.current?.refetchQueries).toBeInstanceOf(Function)
      expect(result.current?.clearCache).toBeInstanceOf(Function)
    })

    it('should throw error when context is undefined', () => {
      // Given: Use context outside ScreenQueryProvider
      // When/Then: Verify that error is thrown
      const { result } = renderHook(() => React.useContext(ScreenQueryContext))
      expect(result.current).toBeUndefined()
    })
  })

  // getQueryResult tests moved to ScreenQueryProvider.getQueryResult.test.tsx
  // refetchQueries tests moved to ScreenQueryProvider.refetchAllQueries.test.tsx
  // clearCache tests moved to ScreenQueryProvider.clearCache.test.tsx
  // Promise Management tests moved to ScreenQueryProvider.promises.test.tsx
  // Observer Management tests moved to ScreenQueryProvider.observers.test.tsx
  // Memory Management tests moved to ScreenQueryProvider.memory.test.tsx
})
