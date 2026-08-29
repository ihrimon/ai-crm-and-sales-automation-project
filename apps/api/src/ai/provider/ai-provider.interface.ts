// ADR-007 (docs/decisions/ADR-007-ai-provider-adapter.md): the rest of the
// system depends on this interface, never on a provider SDK directly. All
// prompt construction, response parsing, and output-shape validation happen
// inside whichever adapter implements it — callers only ever see a
// validated, provider-neutral result or one of ai-provider.errors.ts's two
// error types.

// guideline/04-ai-features.md §9.1's declared input list — deliberately
// narrow (NFR-038: only send permitted context to an external provider).
// No email/phone/other PII the scoring/qualification decision doesn't need.
export interface LeadContext {
  industry: string | null;
  jobTitle: string | null;
  budget: number | null;
  source: string | null;
  companyName: string | null;
  companySize: string | null;
  recentActivity: string[]; // Activity.notes, most recent first
}

export interface ScoreResult {
  score: number; // 0-100
  classification: string;
  reasons: string[];
  recommendedAction: string; // FR-051 🔎
}

export interface QualifyResult {
  classification: string; // "High" | "Medium" | "Low" per guideline §9.2
  reasons: string[];
}

// Structured per guideline/04-ai-features.md §9.4 🔎 (Close/Zoho-style named
// fields instead of one paragraph).
export interface SummaryResult {
  intent: string;
  painPoints: string[];
  actionItems: string[];
  nextFollowUp: string;
}

export interface EmailContext {
  leadName: string;
  companyName: string | null;
  jobTitle: string | null;
  tone: string | null;
}

export interface EmailResult {
  subject: string;
  body: string;
}

export const AI_PROVIDER_ADAPTER = Symbol('AI_PROVIDER_ADAPTER');

export interface AiProviderAdapter {
  score(context: LeadContext): Promise<ScoreResult>;
  qualify(context: LeadContext): Promise<QualifyResult>;
  summarize(conversationText: string): Promise<SummaryResult>;
  generateEmail(context: EmailContext): Promise<EmailResult>;
}
