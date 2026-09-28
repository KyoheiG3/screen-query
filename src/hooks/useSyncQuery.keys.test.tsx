import {
  keepPreviousData,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type React from 'react'
import { Suspense, useDeferredValue, useEffect, useState } from 'react'
import { ScreenQueryProvider } from '~/providers/ScreenQueryProvider'
import { delay, suppressConsoleError } from '~/test-utils/screen-query'
import { useQueryKey } from './useQueryKey'
import { useScreenQueryContext } from './useScreenQueryContext'
import { useSyncQuery } from './useSyncQuery'

/** Times the Suspense fallback committed. A render React discards is not counted */
let fallbacks = 0

function Fallback() {
  useEffect(() => {
    fallbacks++
  }, [])
  return 'loading'
}

const fetched: string[] = []

/** Components render bare strings, so adjacent ones share a text node */
function text() {
  return document.body.textContent ?? ''
}

async function fetchCondition(condition: string) {
  fetched.push(condition)
  await delay(10)
  return condition
}

let refetch: () => Promise<void> = async () => {}

/** A list whose key follows a condition, kept on screen while the next one loads */
function List({ condition, keep }: { condition: string; keep: boolean }) {
  const rows = useSyncQuery(
    useQueryKey({
      queryKey: ['list', condition],
      queryFn: () => fetchCondition(condition),
      placeholderData: keep ? keepPreviousData : undefined,
    }),
  )
  refetch = useScreenQueryContext().refetchQueries
  return `rows: ${rows}`
}

function Screen({ keep }: { keep: boolean }) {
  const [condition, setCondition] = useState('a')
  const deferred = useDeferredValue(condition)
  return (
    <>
      <button type="button" onClick={() => setCondition(`${condition}a`)}>
        next
      </button>
      <Suspense fallback={<Fallback />}>
        <List condition={keep ? condition : deferred} keep={keep} />
      </Suspense>
    </>
  )
}

describe('useSyncQuery with a key that changes', () => {
  let queryClient: QueryClient

  function tree(children: React.ReactNode) {
    return (
      <QueryClientProvider client={queryClient}>
        <ScreenQueryProvider>{children}</ScreenQueryProvider>
      </QueryClientProvider>
    )
  }

  beforeEach(() => {
    suppressConsoleError()
    // Keys the list moved away from stay cached, as they do with the default gcTime
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 60_000 } },
    })
    fallbacks = 0
    fetched.length = 0
  })

  afterEach(() => {
    vi.restoreAllMocks()
    queryClient.clear()
  })

  describe.each([
    { form: 'placeholderData: keepPreviousData', keep: true },
    { form: 'useDeferredValue', keep: false },
  ])('when the previous data is kept with $form', ({ keep }) => {
    it('should keep the previous data on screen every time the key changes', async () => {
      // Given: The first list is on screen
      render(tree(<Screen keep={keep} />))
      await waitFor(() => expect(text()).toContain('rows: a'))
      expect(fallbacks).toBe(1)

      for (const next of ['aa', 'aaa', 'aaaa', 'aaaaa']) {
        // When: The condition changes again
        await act(async () => {
          fireEvent.click(screen.getByText('next'))
        })

        // Then: The list moves to the new key without falling back to loading
        await waitFor(() => expect(text()).toContain(`rows: ${next}`))
      }
      expect(fallbacks).toBe(1)
    })

    it('should refetch only the key the list reads now', async () => {
      // Given: The condition changed twice after the first list
      render(tree(<Screen keep={keep} />))
      await waitFor(() => expect(text()).toContain('rows: a'))
      for (const next of ['aa', 'aaa']) {
        await act(async () => {
          fireEvent.click(screen.getByText('next'))
        })
        await waitFor(() => expect(text()).toContain(`rows: ${next}`))
      }
      fetched.length = 0

      // When: Every registered query is refetched
      await act(async () => {
        await refetch()
      })

      // Then: The keys the list moved away from are not fetched again
      expect(fetched).toEqual(['aaa'])
    })
  })

  it('should stop refetching the keys of a component that unmounted', async () => {
    // Given: Two components read their own key, then one of them leaves
    function Other() {
      return `other: ${useSyncQuery(useQueryKey({ queryKey: ['other'], queryFn: () => fetchCondition('other') }))}`
    }
    function Page() {
      const [open, setOpen] = useState(true)
      return (
        <>
          <button type="button" onClick={() => setOpen(false)}>
            close
          </button>
          <Suspense fallback={<Fallback />}>
            <List condition="a" keep={false} />
            {open && <Other />}
          </Suspense>
        </>
      )
    }
    render(tree(<Page />))
    await waitFor(() => expect(text()).toContain('other: other'))
    fireEvent.click(screen.getByText('close'))
    await act(async () => {})
    fetched.length = 0

    // When: Every registered query is refetched
    await act(async () => {
      await refetch()
    })

    // Then: Only the component still on screen has its query fetched again
    expect(fetched).toEqual(['a'])
  })

  it('should keep refetching a key another component still reads', async () => {
    // Given: Two components read the same key, then one of them leaves
    function Page() {
      const [open, setOpen] = useState(true)
      return (
        <>
          <button type="button" onClick={() => setOpen(false)}>
            close
          </button>
          <Suspense fallback={<Fallback />}>
            <List condition="a" keep={false} />
            {open && <List condition="a" keep={false} />}
          </Suspense>
        </>
      )
    }
    render(tree(<Page />))
    await waitFor(() => expect(text()).toContain('rows: arows: a'))
    fireEvent.click(screen.getByText('close'))
    await act(async () => {})
    fetched.length = 0

    // When: Every registered query is refetched
    await act(async () => {
      await refetch()
    })

    // Then: The key the remaining component reads is fetched again
    expect(fetched).toEqual(['a'])
  })

  it('should keep a key that is released and held again in the same commit', async () => {
    // Given: The list reads its key, and its hold is released and taken again at
    // once, as StrictMode does right after mounting and as a key moving between
    // components does
    let retain: ReturnType<typeof useScreenQueryContext>['retainQueries'] =
      () => () => {}
    function Holder() {
      retain = useScreenQueryContext().retainQueries
      return null
    }
    render(
      tree(
        <>
          <Holder />
          <Screen keep={false} />
        </>,
      ),
    )
    await waitFor(() => expect(text()).toContain('rows: a'))
    const release = retain([{ queryKey: ['list', 'a'] }])
    release()
    retain([{ queryKey: ['list', 'a'] }])
    await act(async () => {})
    fetched.length = 0

    // When: Every registered query is refetched
    await act(async () => {
      await refetch()
    })

    // Then: The key is still registered
    expect(fetched).toEqual(['a'])
  })

  it('should still wait for a key another component is loading', async () => {
    // Given: One component reads a slow query next to one that resolves at once
    function Slow() {
      return `slow: ${useSyncQuery(
        useQueryKey({
          queryKey: ['slow'],
          queryFn: async () => {
            await delay(50)
            return 'done'
          },
        }),
      )}`
    }
    function Fast() {
      return `fast: ${useSyncQuery(useQueryKey({ queryKey: ['fast'], queryFn: async () => 'done' }))}`
    }

    // When: Both mount under the same boundary
    render(
      tree(
        <Suspense fallback={<Fallback />}>
          <Fast />
          <Slow />
        </Suspense>,
      ),
    )
    await delay(20)

    // Then: Nothing paints until the slow query settles too
    expect(text()).not.toContain('fast: done')
    await waitFor(() => expect(text()).toContain('slow: done'))
    expect(text()).toContain('fast: done')
  })
})
