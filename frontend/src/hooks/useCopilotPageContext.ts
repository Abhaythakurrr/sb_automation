'use client';
/**
 * Registers the current page with the Copilot.
 *
 * Drop this into any page component and the Copilot immediately knows where the
 * user is, which step they are on and what record is in focus — so its
 * suggestions and answers are specific rather than generic.
 *
 *   useCopilotPageContext('job-creation', { step: stage, focus: selectedJob });
 *
 * The store deduplicates and debounces, so passing changing values on every
 * render is fine.
 */
import { useEffect, useMemo } from 'react';
import { useCopilotStore } from '@/store/useCopilotStore';
import { useConnectionStore } from '@/store/useConnectionStore';
import { CopilotPageId } from '@/types/copilot';

interface Options {
  step?: string;
  focus?: string;
  /** Non-sensitive page state worth sharing (counts, flags, selections). */
  detail?: Record<string, unknown>;
  /** Skip registration, e.g. while a tab is hidden. */
  active?: boolean;
}

export function useCopilotPageContext(page: CopilotPageId, opts: Options = {}): void {
  const { step, focus, detail, active = true } = opts;
  const setContext = useCopilotStore(s => s.setContext);
  const connected = useConnectionStore(s => s.connected);

  // Stringify the detail object so a new object literal each render does not
  // retrigger the effect.
  const detailKey = useMemo(() => (detail ? JSON.stringify(detail) : ''), [detail]);

  useEffect(() => {
    if (!active || !connected) return;
    setContext({
      page,
      step,
      focus,
      detail: detailKey ? (JSON.parse(detailKey) as Record<string, unknown>) : undefined,
    });
  }, [page, step, focus, detailKey, active, connected, setContext]);
}

/**
 * Keeps the Copilot's upload awareness in sync with a parsed file.
 *
 * Pass the filename and rows as they change; pass null once the file is cleared.
 * The Copilot validates the rows server-side as soon as it receives them, so
 * findings are ready before the user thinks to ask.
 */
export function useCopilotUpload(filename: string | null, rows: any[] | null): void {
  const shareUpload = useCopilotStore(s => s.shareUpload);
  const clearUpload = useCopilotStore(s => s.clearUpload);
  const connected = useConnectionStore(s => s.connected);

  // Only re-share when the file identity or row count actually changes.
  const signature = filename && rows ? `${filename}:${rows.length}` : '';

  useEffect(() => {
    if (!connected) return;
    if (!filename || !rows || rows.length === 0) {
      clearUpload();
      return;
    }
    shareUpload(filename, rows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, connected]);
}

/** Keeps the Copilot aware of the payloads generated from the current rows. */
export function useCopilotPayloads(
  payloads: { name: string; task: any; trigger: any; summary?: string }[] | null,
): void {
  const sharePayloads = useCopilotStore(s => s.sharePayloads);
  const connected = useConnectionStore(s => s.connected);
  const signature = payloads ? `${payloads.length}:${payloads.map(p => p.name).join(',')}` : '';

  useEffect(() => {
    if (!connected || !payloads || payloads.length === 0) return;
    sharePayloads(payloads);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, connected]);
}

/** Keeps the Copilot aware of execution outcomes, so it can explain failures. */
export function useCopilotExecutions(
  executions: { name: string; type: 'task' | 'trigger'; status: 'pending' | 'success' | 'failed'; message?: string }[] | null,
): void {
  const shareExecutions = useCopilotStore(s => s.shareExecutions);
  const connected = useConnectionStore(s => s.connected);

  // Share only settled results, and only when the settled set changes.
  const settled = (executions || []).filter(e => e.status !== 'pending');
  const signature = `${settled.length}:${settled.filter(e => e.status === 'failed').length}`;

  useEffect(() => {
    if (!connected || settled.length === 0) return;
    shareExecutions(settled);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, connected]);
}
