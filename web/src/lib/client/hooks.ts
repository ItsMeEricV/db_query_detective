'use client';

/**
 * TanStack Query hooks — the single seam through which components touch server
 * state. Keeping fetching here (not in components) satisfies the ARCHITECTURE
 * rule: components are presentational and never fetch in a useEffect.
 */
import { useSyncExternalStore } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DemoQuery } from '@/lib/analyze/demo-data';
import { analyze, clearDdls, getDdls, putDdl, seedDemoData } from './api';
import {
  getDemoQueriesServerSnapshot,
  getDemoQueriesSnapshot,
  setCachedDemoQueries,
  subscribeDemoQueries,
} from './session';

const ddlsKey = ['ddls'] as const;

/** The session's stored tables. */
export function useDdls() {
  return useQuery({ queryKey: ddlsKey, queryFn: getDdls });
}

/** Upsert one table; refreshes the DDL list on success. */
export function usePutDdl() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ table, sql }: { table: string; sql: string }) => putDdl(table, sql),
    onSuccess: () => qc.invalidateQueries({ queryKey: ddlsKey }),
  });
}

/** Run a query through the engine. The result lives in `mutation.data`. */
export function useAnalyze() {
  return useMutation({ mutationFn: (query: string) => analyze(query) });
}

/** Load the demo schema; refreshes the DDL list and caches the query ladder. */
export function useSeedDemo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: seedDemoData,
    onSuccess: (data) => {
      setCachedDemoQueries(data.queries);
      void qc.invalidateQueries({ queryKey: ddlsKey });
    },
  });
}

/** Clear the session's DDLs + runs; refreshes the list and drops the demo chips. */
export function useClearDdls() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: clearDdls,
    onSuccess: () => {
      setCachedDemoQueries([]);
      void qc.invalidateQueries({ queryKey: ddlsKey });
    },
  });
}

/** The persisted demo-query chips, read SSR-safely from the localStorage store. */
export function useCachedDemoQueries(): DemoQuery[] {
  return useSyncExternalStore(
    subscribeDemoQueries,
    getDemoQueriesSnapshot,
    getDemoQueriesServerSnapshot,
  );
}
