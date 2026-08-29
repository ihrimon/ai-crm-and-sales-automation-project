import { Injectable } from '@nestjs/common';
import type {
  AiProviderAdapter,
  EmailContext,
  EmailResult,
  LeadContext,
  QualifyResult,
  ScoreResult,
  SummaryResult,
} from './ai-provider.interface';

// Selected instead of AnthropicProviderAdapter whenever ANTHROPIC_API_KEY is
// unset (see ai-provider.factory.ts) — the same "no external provider
// configured yet, but the feature still has to run end to end" situation M1
// hit for email delivery (console-logged links instead of a real send).
// Deterministic, no network call, safe for local dev without a key and for
// tests that need the async 202-then-poll flow to actually complete.
@Injectable()
export class StubProviderAdapter implements AiProviderAdapter {
  async score(context: LeadContext): Promise<ScoreResult> {
    const reasons: string[] = [];
    let score = 40;

    if (context.jobTitle) {
      reasons.push(`Job title on file: ${context.jobTitle}`);
      score += 15;
    }
    if (context.budget && context.budget > 0) {
      reasons.push(`Budget indicated: ${context.budget}`);
      score += 20;
    }
    if (context.companyName) {
      reasons.push(`Associated with company: ${context.companyName}`);
      score += 10;
    }
    if (context.recentActivity.length > 0) {
      reasons.push(`${context.recentActivity.length} recent activity entr${context.recentActivity.length === 1 ? 'y' : 'ies'} logged`);
      score += 10;
    }
    if (reasons.length === 0) {
      reasons.push('Limited information available on this lead so far.');
    }

    score = Math.min(99, score);
    const classification = score >= 75 ? 'High Intent' : score >= 50 ? 'Medium Intent' : 'Low Intent';
    const recommendedAction =
      score >= 75 ? 'Contact within 24 hours.' : score >= 50 ? 'Follow up this week.' : 'Nurture with periodic check-ins.';

    return { score, classification, reasons, recommendedAction };
  }

  async qualify(context: LeadContext): Promise<QualifyResult> {
    const score = await this.score(context);
    const classification = score.score >= 75 ? 'High' : score.score >= 50 ? 'Medium' : 'Low';
    return { classification, reasons: score.reasons };
  }

  async summarize(conversationText: string): Promise<SummaryResult> {
    const trimmed = conversationText.trim();
    if (!trimmed) {
      return {
        intent: 'No conversation content available to summarize yet.',
        painPoints: [],
        actionItems: [],
        nextFollowUp: 'Log an activity with notes, then summarize again.',
      };
    }
    const firstLine = trimmed.split('\n')[0].slice(0, 200);
    return {
      intent: `Prospect discussion noted: "${firstLine}"`,
      painPoints: ['(stub) No AI provider configured — this is a placeholder summary.'],
      actionItems: ['Review the logged activity notes directly.'],
      nextFollowUp: 'Follow up within a few business days.',
    };
  }

  async generateEmail(context: EmailContext): Promise<EmailResult> {
    const tone = context.tone ?? 'professional';
    const company = context.companyName ? ` at ${context.companyName}` : '';
    return {
      subject: `Following up${company}`,
      body: [
        `Hi ${context.leadName},`,
        '',
        `Thanks for your time${company}. I wanted to follow up and see if you had any questions or if now is a good time to discuss next steps.`,
        '',
        'Looking forward to hearing from you.',
        '',
        'Best regards,',
        '',
        `(stub draft, ${tone} tone — no AI provider configured)`,
      ].join('\n'),
    };
  }
}
