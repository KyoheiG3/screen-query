import type {
  QueryKey,
  UseMutationOptions,
  UseQueryOptions,
  UseQueryResult,
} from '@tanstack/react-query'
import { useQuery } from '@tanstack/react-query'

// Type that extends UseQueryResult with queryKey
export type UseQueryKeyResult<
  TData = unknown,
  TError = Error,
> = UseQueryResult<TData, TError> & { queryKey: QueryKey }

// Type for useQuery options
export type QueryOptions<
  TData = unknown,
  TError = Error,
> = Omit<UseQueryOptions<TData, TError>, 'queryKey' | 'queryFn'>

// Type for useMutation options
export type MutationOptions<
  TData = unknown,
  TError = Error,
  TVariables = void,
  TContext = unknown,
> = Omit<
  UseMutationOptions<TData, TError, TVariables, TContext>,
  'mutationKey' | 'mutationFn'
>

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
 * const query = useQuery({ queryKey: ['user'], queryFn: fetchUser })
 * const [data] = getQueryResult([{ ...query, queryKey: query.queryKey }])
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
  TError = Error,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  options: UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
): UseQueryKeyResult<TData, TError> {
  const result = useQuery(options)

  return {
    ...result,
    // queryKey is required, so it will never be undefined
    queryKey: options.queryKey,
  }
}
