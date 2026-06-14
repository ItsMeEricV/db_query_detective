'use client';

import { useState } from 'react';
import {
  useAnalyze,
  useCachedDemoQueries,
  useClearDdls,
  useDdls,
  usePutDdl,
  useSeedDemo,
} from '@/lib/client/hooks';
import { strings } from '@/lib/strings';
import { Banner } from '@/components/Banner';
import { Band } from '@/components/Band';
import { Button } from '@/components/Button';
import { ConfirmModal } from '@/components/ConfirmModal';
import { DdlPanel } from '@/components/ddl/DdlPanel';
import { DmlPanel } from '@/components/dml/DmlPanel';
import { AnalysisPanel } from '@/components/analysis/AnalysisPanel';
import { DetectivePanel } from '@/components/DetectivePanel';

function errorText(err: unknown): string | null {
  if (!err) return null;
  return err instanceof Error ? err.message : strings.errors.generic;
}

/**
 * The single smart container. It owns all server-state hooks and threads
 * validated data + callbacks into the presentational panels, keeping
 * components/ free of data fetching (per ARCHITECTURE).
 */
export function DetectiveApp() {
  const [query, setQuery] = useState('');

  const [confirmClear, setConfirmClear] = useState(false);

  const ddls = useDdls();
  const seed = useSeedDemo();
  const analyze = useAnalyze();
  const put = usePutDdl();
  const clear = useClearDdls();

  // Chips come from the last seed response, falling back to the persisted cache
  // on reload (an external store — SSR-safe, no hydration mismatch).
  const cachedDemoQueries = useCachedDemoQueries();
  const demoQueries = seed.data?.queries ?? cachedDemoQueries;

  // Clear all → wipe server data, then reset every client-held bit of state back
  // to the original empty workspace (chips drop via the hook's cache clear).
  const handleConfirmClear = async () => {
    try {
      await clear.mutateAsync();
      seed.reset();
      analyze.reset();
      setQuery('');
      setConfirmClear(false);
    } catch {
      // Leave the modal open on failure; the mutation surfaces clear.isError.
    }
  };

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-10 sm:px-6">
      <Banner />

      <Band
        label={strings.ddl.heading}
        hint={strings.ddl.hint}
        action={
          <>
            <Button variant="primary" onClick={() => seed.mutate()} disabled={seed.isPending}>
              {seed.isPending ? strings.ddl.loading : strings.ddl.loadDemo}
            </Button>
            <Button
              variant="danger"
              onClick={() => setConfirmClear(true)}
              disabled={(ddls.data?.length ?? 0) === 0 || clear.isPending}
            >
              {strings.ddl.clearAll}
            </Button>
          </>
        }
      >
        <DdlPanel
          tables={ddls.data ?? []}
          isLoading={ddls.isLoading}
          loadError={errorText(ddls.error)}
          onLoadDemo={() => seed.mutate()}
          loadingDemo={seed.isPending}
          onSaveTable={async (name, sql) => {
            await put.mutateAsync({ table: name, sql });
          }}
          saving={put.isPending}
          saveError={errorText(put.error)}
          onResetError={() => put.reset()}
        />
      </Band>

      <Band label={strings.dml.heading} hint={strings.dml.hint}>
        <DmlPanel
          query={query}
          onQueryChange={setQuery}
          demoQueries={demoQueries}
          onAnalyze={() => analyze.mutate(query)}
          analyzing={analyze.isPending}
          analyzeError={errorText(analyze.error)}
        />
        <div className="mt-6 border-t border-line pt-5">
          <h3 className="mb-3 font-mono text-[0.7rem] font-semibold uppercase tracking-[0.28em] text-accent">
            {strings.analysis.heading}
          </h3>
          <AnalysisPanel result={analyze.data} analyzing={analyze.isPending} />
        </div>
      </Band>

      <Band label={strings.detective.heading}>
        <DetectivePanel result={analyze.data} />
      </Band>

      <ConfirmModal
        open={confirmClear}
        title={strings.ddl.clearTitle}
        body={strings.ddl.clearBody}
        confirmLabel={clear.isPending ? strings.ddl.clearing : strings.ddl.clearConfirm}
        cancelLabel={strings.ddl.cancel}
        busy={clear.isPending}
        onConfirm={handleConfirmClear}
        onCancel={() => setConfirmClear(false)}
      />
    </main>
  );
}
