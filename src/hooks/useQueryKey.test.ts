import { renderHook, waitFor } from '@testing-library/react'
import { createQueryClient, createQueryClientWrapper } from '~/test-utils/screen-query'
import { useQueryKey } from './useQueryKey'

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
    const queryFn = jest.fn().mockResolvedValue({ data: 'test' })

    // When: Hook is used
    const { result } = renderHook(
      () =>
        useQueryKey({
          queryKey,
          queryFn,
        }),
      { wrapper },
    )

    // Then: queryKey should be included in the result
    expect(result.current.queryKey).toEqual(queryKey)

    // And: All useQuery functionality should work
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(result.current.data).toEqual({ data: 'test' })

    // And: The original useQuery methods should be preserved
    expect(result.current.refetch).toBeInstanceOf(Function)
    expect(result.current.isLoading).toBeDefined()
    expect(result.current.isError).toBeDefined()
  })

  it('should preserve queryKey reference from options', () => {
    // Given: A query configuration with a specific queryKey
    const queryKey = ['stable-key']
    const queryFn = jest.fn().mockResolvedValue({ data: 'test' })

    // When: Hook is rendered multiple times
    const { result, rerender } = renderHook(
      () =>
        useQueryKey({
          queryKey,
          queryFn,
        }),
      { wrapper },
    )

    const firstQueryKey = result.current.queryKey
    rerender()
    const secondQueryKey = result.current.queryKey

    // Then: queryKey should be the exact reference passed in options
    expect(firstQueryKey).toBe(queryKey)
    expect(secondQueryKey).toBe(queryKey)
  })
})