import {
  type QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import { type ReactNode, Suspense } from 'react'
import { ScreenQueryProvider } from '~/providers/ScreenQueryProvider'
import {
  createQueryClient,
  delay,
  useTestScreenQueryContext,
} from '~/test-utils/screen-query'

const goneKey = ['screen-scope-gone']
const liveKey = ['screen-scope-live']

describe('ScreenQueryProvider screen scope', () => {
  let queryClient: QueryClient
  let goneFetchCount: number

  // gcTime keeps the first screen's entry in the cache after the screen itself is
  // gone, which is the state this file is about: registered with the provider,
  // held by no live screen
  function useScopedQuery(queryKey: string[], queryFn: () => Promise<string>) {
    return useQuery({ queryKey, queryFn, gcTime: 60_000 })
  }

  function Gone() {
    const query = useScopedQuery(goneKey, async () => {
      goneFetchCount++
      await delay(10)
      return 'gone'
    })
    const context = useTestScreenQueryContext()
    const [data] = context.getQueryResult([{ ...query, queryKey: goneKey }])

    return `gone: ${data}`
  }

  function Live() {
    const query = useScopedQuery(liveKey, async () => {
      await delay(10)
      return 'live'
    })
    const context = useTestScreenQueryContext()
    const [data] = context.getQueryResult([{ ...query, queryKey: liveKey }])

    return `live: ${data}`
  }

  function tree(children: ReactNode) {
    return (
      <QueryClientProvider client={queryClient}>
        <ScreenQueryProvider>
          <Suspense fallback="loading">{children}</Suspense>
        </ScreenQueryProvider>
      </QueryClientProvider>
    )
  }

  beforeEach(() => {
    // Given: Initialize new QueryClient
    queryClient = createQueryClient()
    goneFetchCount = 0
  })

  afterEach(() => {
    // Cleanup after test
    vi.restoreAllMocks()
    queryClient.clear()
  })

  it('should not gate a screen on a pending query no live screen holds', async () => {
    // Given: A screen has resolved and gone away, leaving its query registered with
    // the provider - the provider outlives any one screen
    const { rerender } = render(tree(<Gone />))
    await waitFor(() => {
      expect(screen.getByText('gone: gone')).toBeTruthy()
    })
    rerender(tree(null))
    const goneFetchCountBeforeReset = goneFetchCount

    // When: Every query is rewound, including the one no screen is holding, and a
    // new screen asks only for its own query
    await act(async () => {
      void queryClient.resetQueries()
      await delay(0)
    })
    rerender(tree(<Live />))

    // Then: The new screen paints as soon as its own query settles
    await waitFor(() => {
      expect(screen.getByText('live: live')).toBeTruthy()
    })

    // And: the abandoned query is left alone - still pending, never fetched to get
    // there. Reading its live state instead would gate every screen on queries
    // that no longer belong to one, and fetch them again to be allowed to paint
    expect(
      queryClient.getQueryCache().find({ queryKey: goneKey })?.state.status,
    ).toBe('pending')
    expect(goneFetchCount).toBe(goneFetchCountBeforeReset)
  })
})
