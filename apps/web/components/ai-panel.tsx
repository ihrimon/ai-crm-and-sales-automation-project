'use client';

import type { AIAnalysis, AIAnalysisType, EmailDraft } from '@ai-crm/types';
import { useState } from 'react';
import {
  ApiRequestError,
  pollAiAnalysis,
  pollEmailDraft,
  requestAiAnalysis,
  requestEmailDraft,
  updateEmailDraft,
} from '../lib/api';
import type { Session } from '../lib/session';

// FR-036–FR-040, FR-051 🔎 · docs/ui-ux/README.md §5.3 "AI ANALYSIS" panel.
// Async 202-then-poll flow (architecture/README.md §6.2): each button
// disables itself and shows a spinner state, the panel updates in place
// when the result lands — never a page reload.
export function AiPanel({ session, leadId, canUse }: { session: Session; leadId: string; canUse: boolean }) {
  const [pending, setPending] = useState<AIAnalysisType | 'EMAIL' | null>(null);
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [emailDraft, setEmailDraft] = useState<EmailDraft | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runAnalysis(type: AIAnalysisType) {
    setPending(type);
    setError(null);
    try {
      const { analysisId } = await requestAiAnalysis(session.accessToken, leadId, { type });
      const result = await pollAiAnalysis(session.accessToken, leadId, analysisId);
      setAnalysis(result);
      if (result.status === 'FAILED') setError(result.errorMessage ?? 'AI analysis failed.');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not run AI analysis.');
    } finally {
      setPending(null);
    }
  }

  async function generateEmail() {
    setPending('EMAIL');
    setError(null);
    try {
      const { emailDraftId } = await requestEmailDraft(session.accessToken, leadId, {});
      const draft = await pollEmailDraft(session.accessToken, emailDraftId);
      setEmailDraft(draft);
      if (draft.status === 'FAILED') setError(draft.errorMessage ?? 'Could not generate an email draft.');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not generate an email draft.');
    } finally {
      setPending(null);
    }
  }

  async function discardDraft() {
    if (!emailDraft) return;
    try {
      setEmailDraft(await updateEmailDraft(session.accessToken, emailDraft.id, { status: 'DISCARDED' }));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not discard this draft.');
    }
  }

  async function markSentManually() {
    if (!emailDraft) return;
    try {
      setEmailDraft(
        await updateEmailDraft(session.accessToken, emailDraft.id, {
          subject: emailDraft.subject ?? undefined,
          body: emailDraft.body ?? undefined,
          status: 'SENT_MANUALLY',
        }),
      );
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not update this draft.');
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">AI Analysis</h2>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      {analysis && analysis.status === 'COMPLETED' && (
        <div className="flex flex-col gap-1 rounded border border-neutral-200 p-3 text-sm">
          {analysis.score !== null && <p>Score: {analysis.score}</p>}
          {analysis.classification && <p>Classification: {analysis.classification}</p>}
          {analysis.reasons && analysis.reasons.length > 0 && (
            <ul className="list-inside list-disc text-neutral-600">
              {analysis.reasons.map((reason, i) => (
                <li key={i}>{reason}</li>
              ))}
            </ul>
          )}
          {analysis.recommendedAction && <p className="mt-1 font-medium">Recommended Action: {analysis.recommendedAction}</p>}
        </div>
      )}
      {analysis && analysis.status === 'PENDING' && <p className="text-sm text-neutral-500">Still processing…</p>}

      {canUse && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending !== null}
            onClick={() => runAnalysis('SCORE')}
            className="rounded border border-neutral-300 px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            {pending === 'SCORE' ? 'Scoring…' : 'Score with AI'}
          </button>
          <button
            type="button"
            disabled={pending !== null}
            onClick={() => runAnalysis('QUALIFICATION')}
            className="rounded border border-neutral-300 px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            {pending === 'QUALIFICATION' ? 'Qualifying…' : 'Qualify with AI'}
          </button>
          <button
            type="button"
            disabled={pending !== null}
            onClick={() => runAnalysis('SUMMARY')}
            className="rounded border border-neutral-300 px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            {pending === 'SUMMARY' ? 'Summarizing…' : 'Summarize Activity'}
          </button>
        </div>
      )}

      {canUse && (
        <button
          type="button"
          disabled={pending !== null}
          onClick={generateEmail}
          className="self-start rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending === 'EMAIL' ? 'Generating…' : 'Generate Follow-up Email'}
        </button>
      )}

      {emailDraft && emailDraft.status !== 'PENDING' && (
        <div className="flex flex-col gap-2 rounded border border-neutral-200 p-3 text-sm">
          {emailDraft.status === 'FAILED' ? (
            <p className="text-red-600">{emailDraft.errorMessage}</p>
          ) : (
            <>
              <input
                type="text"
                value={emailDraft.subject ?? ''}
                disabled={emailDraft.status !== 'DRAFT'}
                onChange={(e) => setEmailDraft({ ...emailDraft, subject: e.target.value })}
                className="rounded border border-neutral-300 px-2 py-1 font-medium disabled:bg-neutral-100"
              />
              <textarea
                value={emailDraft.body ?? ''}
                disabled={emailDraft.status !== 'DRAFT'}
                onChange={(e) => setEmailDraft({ ...emailDraft, body: e.target.value })}
                rows={6}
                className="rounded border border-neutral-300 px-2 py-1 disabled:bg-neutral-100"
              />
              <p className="text-xs uppercase tracking-wide text-neutral-500">Status: {emailDraft.status}</p>
              {emailDraft.status === 'DRAFT' && (
                <div className="flex gap-2">
                  <button type="button" onClick={markSentManually} className="rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white">
                    Mark as Sent
                  </button>
                  <button type="button" onClick={discardDraft} className="rounded border border-neutral-300 px-3 py-2 text-sm">
                    Discard
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
