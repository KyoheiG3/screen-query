import { renderHook, waitFor } from '@testing-library/react'
import {
  createQueryClient,
  createQueryClientWrapper,
} from '~/test-utils/screen-query'
import { useInfiniteQueryKey, useQueryKey } from './useQueryKey'

/** @jest-environment jsdom */

describe('useQueryKey', () => {
  const queryClient = createQueryClient()
  const wrapper = createQueryClientWrapper(queryClient)

  afterEach(() => {
    queryClient.clear()
  })

  it('should return useQuery result with queryKey included', async () => {
    // Given: A standard query configuration
    const queryKey = ['test-key']
    const mockData = { data: 'test' }
    const queryFn = jest.fn().mockResolvedValue(mockData)

    // When: Hook is used
    const { result } = renderHook(
      () => useQueryKey({ queryKey, queryFn }),
      { wrapper },
    )

    // Then: queryKey should be included in the result
    expect(result.current.queryKey).toBe(queryKey)

    // And: useQuery functionality should work
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(result.current.refetch).toBeInstanceOf(Function)
  })
})

describe('useInfiniteQueryKey', () => {
  const queryClient = createQueryClient()
  const wrapper = createQueryClientWrapper(queryClient)

  afterEach(() => {
    queryClient.clear()
  })

  it('should return useInfiniteQuery result with queryKey included', async () => {
    // Given: An infinite query configuration
    const queryKey = ['infinite-test-key']
    const mockData = { items: ['a', 'b'], nextCursor: null }
    const queryFn = jest.fn().mockResolvedValue(mockData)

    // When: Hook is used
    const { result } = renderHook(
      () =>
        useInfiniteQueryKey({
          queryKey,
          queryFn,
          initialPageParam: null,
          getNextPageParam: () => null,
        }),
      { wrapper },
    )

    // Then: queryKey should be included in the result
    expect(result.current.queryKey).toBe(queryKey)

    // And: useInfiniteQuery functionality should work
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(result.current.fetchNextPage).toBeInstanceOf(Function)
  })
})
