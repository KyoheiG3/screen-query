import {
  keepPreviousData,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type React from 'react'
import {
  Suspense,
  startTransition,
  useDeferredValue,
  useEffect,
  useState,
} from 'react'
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

async function fetchCondition(condition: string, ms = 30) {
  fetched.push(condition)
  await delay(ms)
  return condition
}

let refetch: () => Promise<void> = async () => {}

/** A list whose key follows a condition, kept on screen while the next one loads */
function List({ condition, keep }: { condition: string; keep: boolean }) {
  const rows = useSyncQuery(
    useQueryKey({
      queryKey: ['list', condition],
      // 'slow' stands for a request that outlasts the assertions made meanwhile
      queryFn: () => fetchCondition(condition, condition === 'slow' ? 300 : 30),
      placeholderData: keep ? keepPreviousData : undefined,
    }),
  )
  refetch = useScreenQueryContext().refetchQueries
  return `rows: ${rows}`
}

/** A component reading its own query */
function Item({ id, ms = 30 }: { id: string; ms?: number }) {
  return `${id}: ${useSyncQuery(useQueryKey({ queryKey: [id], queryFn: () => fetchCondition(id, ms) }))} `
}

/** Renders both under one boundary, and drops `leaves` once "close" is pressed */
function Closable({
  stays,
  leaves,
}: {
  stays: React.ReactNode
  leaves: React.ReactNode
}) {
  const [open, setOpen] = useState(true)
  return (
    <>
      <button type="button" onClick={() => setOpen(false)}>
        close
      </button>
      <Suspense fallback={<Fallback />}>
        {stays}
        {open && leaves}
      </Suspense>
    </>
  )
}

/** How the screen hands a new condition to the list */
type Form =
  | 'state'
  | 'useDeferredValue'
  | 'startTransition'
  | 'keepPreviousData'

function Screen({ form }: { form: Form }) {
  const [condition, setCondition] = useState('a')
  const deferred = useDeferredValue(condition)
  const next = () => {
    const update = () => setCondition((current) => `${current}a`)
    if (form === 'startTransition') startTransition(update)
    else update()
  }
  return (
    <>
      <button type="button" onClick={next}>
        next
      </button>
      <Suspense fallback={<Fallback />}>
        <List
          condition={form === 'useDeferredValue' ? deferred : condition}
          keep={form === 'keepPreviousData'}
        />
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

  /** Refetch every registered query and return the keys fetched again */
  async function refetchedKeys() {
    fetched.length = 0
    await act(async () => {
      await refetch()
    })
    return [...fetched]
  }

  async function close() {
    fireEvent.click(screen.getByText('close'))
    await act(async () => {})
  }

  describe.each<{ form: Form; keeps: boolean }>([
    { form: 'useDeferredValue', keeps: true },
    { form: 'startTransition', keeps: true },
    { form: 'keepPreviousData', keeps: true },
    { form: 'state', keeps: false },
  ])('when the condition reaches the list through $form', ({ form, keeps }) => {
    it.each([
      { changes: 'one at a time', settle: true },
      { changes: 'before the previous one loads', settle: false },
    ])('should read only the latest key when it changes $changes', async ({
      settle,
    }) => {
      // Given: The first list is on screen
      render(tree(<Screen form={form} />))
      await waitFor(() => expect(text()).toContain('rows: a'))
      expect(fallbacks).toBe(1)

      // When: The condition changes twice
      for (const next of ['aa', 'aaa']) {
        await act(async () => {
          fireEvent.click(screen.getByText('next'))
        })
        if (settle)
          await waitFor(() => expect(text()).toContain(`rows: ${next}`))
      }
      await waitFor(() => expect(text()).toContain('rows: aaa'))
      await act(async () => {})

      // Then: A form that keeps the previous list never falls back to loading,
      // while a plain state change does, as a suspense query would
      if (keeps) expect(fallbacks).toBe(1)
      else expect(fallbacks).toBeGreaterThan(1)

      // Then: Refetching fetches only the key the list reads now
      expect(await refetchedKeys()).toEqual(['aaa'])
    })
  })

  it('should stop refetching the keys of a component that unmounted', async () => {
    // Given: Two components read their own key, then one of them leaves
    render(
      tree(
        <Closable
          stays={<List condition="a" keep={false} />}
          leaves={<Item id="other" />}
        />,
      ),
    )
    await waitFor(() => expect(text()).toContain('other: other'))
    await close()

    // When: Every registered query is refetched
    // Then: Only the component still on screen has its query fetched again
    expect(await refetchedKeys()).toEqual(['a'])
  })

  it('should keep a key a direct getQueryResult call reads after useSyncQuery releases it', async () => {
    // Given: One component reads a key through getQueryResult, and another reads
    // the same key through useSyncQuery and then leaves
    function Direct() {
      const context = useScreenQueryContext()
      const [rows] = context.getQueryResult([
        useQueryKey({
          queryKey: ['list', 'a'],
          queryFn: () => fetchCondition('a'),
        }),
      ])
      return `direct: ${rows}`
    }
    render(
      tree(
        <Closable
          stays={<Direct />}
          leaves={<List condition="a" keep={false} />}
        />,
      ),
    )
    await waitFor(() => expect(text()).toContain('rows: a'))
    await close()

    // When: Every registered query is refetched
    // Then: The key the direct caller still reads is fetched again
    expect(await refetchedKeys()).toEqual(['a'])
  })

  it('should keep refetching a key another component still reads', async () => {
    // Given: Two components read the same key, then one of them leaves
    render(
      tree(
        <Closable
          stays={<List condition="a" keep={false} />}
          leaves={<List condition="a" keep={false} />}
        />,
      ),
    )
    await waitFor(() => expect(text()).toContain('rows: arows: a'))
    await close()

    // When: Every registered query is refetched
    // Then: The key the remaining component reads is fetched again
    expect(await refetchedKeys()).toEqual(['a'])
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
          <Screen form="useDeferredValue" />
        </>,
      ),
    )
    await waitFor(() => expect(text()).toContain('rows: a'))
    const release = retain([['list', 'a']])
    release()
    retain([['list', 'a']])
    await act(async () => {})

    // When: Every registered query is refetched
    // Then: The key is still registered
    expect(await refetchedKeys()).toEqual(['a'])
  })

  it('should paint components mounting together at once, even under separate boundaries', async () => {
    // Given: Two components mount together under their own boundaries, one of them
    // reading a slower query
    // When: They mount
    render(
      tree(
        <>
          <Suspense fallback={<Fallback />}>
            <Item id="fast" ms={0} />
          </Suspense>
          <Suspense fallback={<Fallback />}>
            <Item id="slow" ms={60} />
          </Suspense>
        </>,
      ),
    )
    await delay(30)

    // Then: The faster one waits for the slower one
    expect(text()).not.toContain('fast: fast')
    await waitFor(() => expect(text()).toContain('slow: slow'))
    expect(text()).toContain('fast: fast')
  })

  it('should not hold a mounting component back for a key a painted component moves to', async () => {
    // Given: The list is on screen, and moves to a slow key in a transition
    function Page() {
      const [condition, setCondition] = useState('a')
      const [open, setOpen] = useState(false)
      return (
        <>
          <button
            type="button"
            onClick={() => startTransition(() => setCondition('slow'))}
          >
            next
          </button>
          <button type="button" onClick={() => setOpen(true)}>
            open
          </button>
          <Suspense fallback={<Fallback />}>
            <List condition={condition} keep={false} />
          </Suspense>
          <Suspense fallback={<Fallback />}>
            {open && <Item id="other" ms={0} />}
          </Suspense>
        </>
      )
    }
    render(tree(<Page />))
    await waitFor(() => expect(text()).toContain('rows: a'))
    await act(async () => {
      fireEvent.click(screen.getByText('next'))
    })

    // When: Another component mounts while the transition is loading
    await act(async () => {
      fireEvent.click(screen.getByText('open'))
    })

    // Then: It paints without waiting for the transition's key
    await waitFor(() => expect(text()).toContain('other: other'))
    expect(text()).toContain('rows: a')
  })

  it('should keep waiting for a component still loading when a release sweeps the registration', async () => {
    // Given: A slow component is still loading when the list on screen moves to
    // another key, which releases the old one and sweeps the registration
    function Page() {
      const [condition, setCondition] = useState('a')
      const [slow, setSlow] = useState(false)
      const [fast, setFast] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setCondition('b')}>
            next
          </button>
          <button type="button" onClick={() => setSlow(true)}>
            slow
          </button>
          <button type="button" onClick={() => setFast(true)}>
            fast
          </button>
          <Suspense fallback={<Fallback />}>
            <List condition={condition} keep />
          </Suspense>
          <Suspense fallback={<Fallback />}>
            {slow && <Item id="slow" ms={80} />}
          </Suspense>
          <Suspense fallback={<Fallback />}>
            {fast && <Item id="fast" ms={0} />}
          </Suspense>
        </>
      )
    }
    render(tree(<Page />))
    await waitFor(() => expect(text()).toContain('rows: a'))
    await act(async () => {
      fireEvent.click(screen.getByText('slow'))
    })
    await act(async () => {
      fireEvent.click(screen.getByText('next'))
    })
    await waitFor(() => expect(text()).toContain('rows: b'))

    // When: Another component mounts while the slow one is still loading
    await act(async () => {
      fireEvent.click(screen.getByText('fast'))
    })
    await delay(20)

    // Then: It still waits for the slow one
    expect(text()).not.toContain('fast: fast')
    await waitFor(() => expect(text()).toContain('slow: slow'))
    await waitFor(() => expect(text()).toContain('fast: fast'))
  })

  it('should not hand a caller on screen the promise a mounting caller waits on for the same key', async () => {
    // Given: Two components mount together - one reads K, the other a slow query -
    // and a list already on screen moves to K with a plain state change
    const resolvedAt: Record<string, number> = {}
    function Timed({ id, ms, name }: { id: string; ms: number; name: string }) {
      const value = useSyncQuery(
        useQueryKey({ queryKey: [id], queryFn: () => fetchCondition(id, ms) }),
      )
      resolvedAt[name] ??= performance.now()
      return `${name}: ${value} `
    }
    function Page() {
      const [id, setId] = useState('x')
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            open
          </button>
          <button type="button" onClick={() => setId('k')}>
            next
          </button>
          <Suspense fallback={<Fallback />}>
            <Timed id={id} ms={30} name={`painted-${id}`} />
          </Suspense>
          <Suspense fallback={<Fallback />}>
            {open && <Timed id="peer" ms={200} name="peer" />}
          </Suspense>
          <Suspense fallback={<Fallback />}>
            {open && <Timed id="k" ms={30} name="mounting" />}
          </Suspense>
        </>
      )
    }
    render(tree(<Page />))
    await waitFor(() => expect(text()).toContain('painted-x: x'))
    await act(async () => {
      fireEvent.click(screen.getByText('open'))
    })
    // The mounting components have suspended on their promises
    await delay(5)

    // When: The list on screen moves to K
    const switchedAt = performance.now()
    await act(async () => {
      fireEvent.click(screen.getByText('next'))
    })
    await waitFor(() => expect(resolvedAt['painted-k']).toBeDefined())

    // Then: It resolves with K, without waiting for the slow query the mounting
    // components wait for
    expect(resolvedAt['painted-k'] - switchedAt).toBeLessThan(150)
    expect(resolvedAt.peer).toBeUndefined()
  })
})
