'use client';

import type { AIAnalysis, AIAnalysisType, EmailDraft } from '@ai-crm/types';
import { Loader2, Mail, Sparkles } from 'lucide-react';
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
import { Alert, AlertDescription } from './ui/alert';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Input } from './ui/input';
import { Separator } from './ui/separator';

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
    <div className="flex flex-col gap-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {analysis && analysis.status === 'COMPLETED' && (
        <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
          <div className="flex items-center gap-2">
            {analysis.score !== null && <Badge>{analysis.score} / 100</Badge>}
            {analysis.classification && <Badge variant="outline">{analysis.classification}</Badge>}
          </div>
          {analysis.reasons && analysis.reasons.length > 0 && (
            <ul className="list-inside list-disc text-muted-foreground">
              {analysis.reasons.map((reason, i) => (
                <li key={i}>{reason}</li>
              ))}
            </ul>
          )}
          {analysis.recommendedAction && (
            <>
              <Separator />
              <p>
                <span className="font-medium">Recommended:</span> {analysis.recommendedAction}
              </p>
            </>
          )}
        </div>
      )}
      {analysis && analysis.status === 'PENDING' && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Still processing…
        </p>
      )}

      {canUse && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={pending !== null} onClick={() => runAnalysis('SCORE')}>
            {pending === 'SCORE' && <Loader2 className="animate-spin" />}
            Score with AI
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={pending !== null} onClick={() => runAnalysis('QUALIFICATION')}>
            {pending === 'QUALIFICATION' && <Loader2 className="animate-spin" />}
            Qualify with AI
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={pending !== null} onClick={() => runAnalysis('SUMMARY')}>
            {pending === 'SUMMARY' && <Loader2 className="animate-spin" />}
            Summarize activity
          </Button>
        </div>
      )}

      {canUse && (
        <Button type="button" size="sm" className="self-start" disabled={pending !== null} onClick={generateEmail}>
          {pending === 'EMAIL' ? <Loader2 className="animate-spin" /> : <Sparkles />}
          Generate follow-up email
        </Button>
      )}

      {emailDraft && emailDraft.status !== 'PENDING' && (
        <div className="flex flex-col gap-2 rounded-lg border p-3 text-sm">
          {emailDraft.status === 'FAILED' ? (
            <p className="flex items-center gap-2 text-destructive">
              <Mail className="size-4" /> {emailDraft.errorMessage}
            </p>
          ) : (
            <>
              <Input
                value={emailDraft.subject ?? ''}
                disabled={emailDraft.status !== 'DRAFT'}
                onChange={(e) => setEmailDraft({ ...emailDraft, subject: e.target.value })}
                className="font-medium"
              />
              <Textarea
                value={emailDraft.body ?? ''}
                disabled={emailDraft.status !== 'DRAFT'}
                onChange={(e) => setEmailDraft({ ...emailDraft, body: e.target.value })}
                rows={6}
              />
              <Badge variant="outline" className="w-fit uppercase tracking-wide">
                {emailDraft.status.replaceAll('_', ' ')}
              </Badge>
              {emailDraft.status === 'DRAFT' && (
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={markSentManually}>
                    Mark as sent
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={discardDraft}>
                    Discard
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
