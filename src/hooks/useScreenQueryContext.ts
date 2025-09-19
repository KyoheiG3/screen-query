import { useContext } from 'react'
import { ScreenQueryContext } from '~/providers/ScreenQueryProvider'

/**
 * Hook to access ScreenQueryProvider context.
 * Provides methods to synchronously manage multiple queries.
 *
 * @example
 * ```tsx
 * const { getQueryResult, refetchQueries, clearCache } = useScreenQueryContext()
 *
 * // Get data from multiple queries synchronously
 * const [userData, postsData] = getQueryResult([userQuery, postsQuery])
 *
 * // Refetch all registered queries
 * await refetchQueries()
 *
 * // Clear error state queries
 * await clearCache('error')
 * ```
 *
 * @returns Context value with query management methods
 * @throws {Error} When used outside of ScreenQueryProvider
 */
export function useScreenQueryContext() {
  const context = useContext(ScreenQueryContext)
  if (!context) {
    throw new Error(
      'ScreenQueryContext must be used within ScreenQueryProvider',
    )
  }

  return context
}
