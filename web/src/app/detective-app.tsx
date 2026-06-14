'use client';

import { useState } from 'react';
import {
  useAnalyze,
  useCachedDemoQueries,
  useClearDdls,
  useDdls,
  usePutDdl,
  useRecommend,
  useSeedDemo,
} from '@/lib/client/hooks';
import { strings } from '@/lib/strings';
import { Banner } from '@/components/Banner';
import { Band } from '@/components/Band';
import { ThemeToggle } from '@/components/ThemeToggle';
import { GitHubLink } from '@/components/GitHubLink';
import { WorkspaceMenu } from '@/components/WorkspaceMenu';
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
  const recommend = useRecommend();

  // A fresh analysis invalidates any prior recommendation — drop it so a stale
  // report never sits under a new run's results.
  const handleAnalyze = () => {
    recommend.reset();
    analyze.mutate(query);
  };

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
      recommend.reset();
      setQuery('');
      setConfirmClear(false);
    } catch {
      // Leave the modal open on failure; clear.error is rendered inline below.
    }
  };

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-10 sm:px-6">
      {/* Controls live in a wrapper (not inside Banner, which is
          overflow-hidden) so the kebab menu can open without being clipped. */}
      <div className="relative">
        <Banner />
        <div className="absolute right-3 top-3 z-20 flex items-center gap-2 sm:right-4 sm:top-4">
          <ThemeToggle />
          <GitHubLink />
          <WorkspaceMenu
            onLoadDemo={() => seed.mutate()}
            loadingDemo={seed.isPending}
            onClearAll={() => setConfirmClear(true)}
            clearDisabled={(ddls.data?.length ?? 0) === 0 || clear.isPending}
          />
        </div>
      </div>

      <Band label={strings.ddl.heading} hint={strings.ddl.hint}>
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
          onAnalyze={handleAnalyze}
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
        <DetectivePanel
          result={analyze.data}
          recommendation={recommend.recommendation}
          isLoading={recommend.isLoading}
          error={recommend.error}
          onAsk={() => {
            if (analyze.data) recommend.ask(analyze.data.runId);
          }}
        />
      </Band>

      <ConfirmModal
        open={confirmClear}
        title={strings.ddl.clearTitle}
        body={strings.ddl.clearBody}
        confirmLabel={clear.isPending ? strings.ddl.clearing : strings.ddl.clearConfirm}
        cancelLabel={strings.ddl.cancel}
        busy={clear.isPending}
        error={errorText(clear.error)}
        onConfirm={handleConfirmClear}
        onCancel={() => setConfirmClear(false)}
      />
    </main>
  );
}
