import type {
  DefaultError,
  InfiniteData,
  QueryKey,
  UseInfiniteQueryOptions,
  UseInfiniteQueryResult,
  UseQueryOptions,
  UseQueryResult,
} from '@tanstack/react-query'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'

/**
 * Utility type that adds queryKey property to any type.
 * @template T - The base type to extend
 */
type WithQueryKey<T> = T & { queryKey: QueryKey }

/**
 * Extended UseQueryResult type that includes queryKey.
 * @template TData - The type of data returned by the query
 * @template TError - The type of error returned by the query
 */
export type UseQueryKeyResult<TData = unknown, TError = DefaultError> =
  WithQueryKey<UseQueryResult<TData, TError>>

/**
 * Extended UseInfiniteQueryResult type that includes queryKey.
 * @template TData - The type of data returned by the query
 * @template TError - The type of error returned by the query
 */
export type UseInfiniteQueryKeyResult<TData = unknown, TError = DefaultError> =
  WithQueryKey<UseInfiniteQueryResult<TData, TError>>

/**
 * Helper function that adds queryKey to a result object.
 * @template T - The type of the result object
 * @param result - The result object to extend
 * @param queryKey - The query key to add
 * @returns The result object with queryKey included
 */
function withQueryKey<T>(result: T, queryKey: QueryKey): WithQueryKey<T> {
  return { ...result, queryKey }
}

/**
 * Custom hook that wraps useQuery and automatically includes queryKey in the return value.
 *
 * @description
 * Works exactly like the standard useQuery hook, but includes the queryKey
 * in the return value for easier integration with getQueryResult.
 *
 * @example
 * ```tsx
 * // Standard useQuery (requires manual spreading)
 * const queryKey = ['user']
 * const query = useQuery({ queryKey, queryFn: fetchUser })
 * const [data] = getQueryResult([{ ...query, queryKey }])
 *
 * // With useQueryKey (cleaner)
 * const query = useQueryKey({ queryKey: ['user'], queryFn: fetchUser })
 * const [data] = getQueryResult([query])
 * ```
 *
 * @param options - Standard useQuery options
 * @returns UseQueryResult with queryKey included
 */
export function useQueryKey<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  options: UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
): UseQueryKeyResult<TData, TError> {
  return withQueryKey(useQuery(options), options.queryKey)
}

/**
 * Custom hook that wraps useInfiniteQuery and automatically includes queryKey in the return value.
 *
 * @description
 * Works exactly like the standard useInfiniteQuery hook, but includes the queryKey
 * in the return value for easier integration with getQueryResult.
 *
 * @example
 * ```tsx
 * // Standard useInfiniteQuery (requires manual spreading)
 * const queryKey = ['posts']
 * const query = useInfiniteQuery({
 *   queryKey,
 *   queryFn: fetchPosts,
 *   getNextPageParam: (lastPage) => lastPage.nextCursor,
 * })
 * const [data] = getQueryResult([{ ...query, queryKey }])
 *
 * // With useInfiniteQueryKey (cleaner)
 * const query = useInfiniteQueryKey({
 *   queryKey: ['posts'],
 *   queryFn: fetchPosts,
 *   getNextPageParam: (lastPage) => lastPage.nextCursor,
 * })
 * const [data] = getQueryResult([query])
 * ```
 *
 * @template TQueryFnData - The type of data returned by the query function
 * @template TError - The type of error returned by the query
 * @template TData - The type of data after transformation
 * @template TQueryKey - The type of the query key
 * @template TPageParam - The type of the page parameter
 * @param options - Standard useInfiniteQuery options
 * @returns UseInfiniteQueryResult with queryKey included
 */
export function useInfiniteQueryKey<
  TQueryFnData,
  TError = DefaultError,
  TData = InfiniteData<TQueryFnData>,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = unknown,
>(
  options: UseInfiniteQueryOptions<
    TQueryFnData,
    TError,
    TData,
    TQueryKey,
    TPageParam
  >,
): UseInfiniteQueryKeyResult<TData, TError> {
  return withQueryKey(useInfiniteQuery(options), options.queryKey)
}
