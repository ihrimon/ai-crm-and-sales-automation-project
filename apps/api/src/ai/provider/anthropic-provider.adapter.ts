import Anthropic from '@anthropic-ai/sdk';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiInvalidOutputError, AiProviderUnavailableError } from './ai-provider.errors';
import type {
  AiProviderAdapter,
  EmailContext,
  EmailResult,
  LeadContext,
  QualifyResult,
  ScoreResult,
  SummaryResult,
} from './ai-provider.interface';

const DEFAULT_MODEL = 'claude-sonnet-5';
const REQUEST_TIMEOUT_MS = 20_000;

// ADR-007's first real ProviderAdapter implementation. All prompt
// construction and response-shape validation live here — nothing outside
// this file knows Anthropic's request/response format.
@Injectable()
export class AnthropicProviderAdapter implements AiProviderAdapter {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(configService: ConfigService) {
    this.client = new Anthropic({
      apiKey: configService.get<string>('ANTHROPIC_API_KEY'),
      timeout: REQUEST_TIMEOUT_MS,
    });
    this.model = configService.get<string>('ANTHROPIC_MODEL') ?? DEFAULT_MODEL;
  }

  async score(context: LeadContext): Promise<ScoreResult> {
    const json = await this.callForJson(
      'You are a B2B sales lead scoring assistant. Respond with ONLY a JSON object, no other text, matching exactly: ' +
        '{"score": <integer 0-100>, "classification": <string>, "reasons": <array of short strings>, "recommendedAction": <short string>}.',
      `Score this lead based on the following permitted context:\n${this.formatLeadContext(context)}`,
    );
    if (
      typeof json.score !== 'number' ||
      json.score < 0 ||
      json.score > 100 ||
      typeof json.classification !== 'string' ||
      !Array.isArray(json.reasons) ||
      !json.reasons.every((r) => typeof r === 'string') ||
      typeof json.recommendedAction !== 'string'
    ) {
      throw new AiInvalidOutputError();
    }
    return {
      score: Math.round(json.score),
      classification: json.classification,
      reasons: json.reasons,
      recommendedAction: json.recommendedAction,
    };
  }

  async qualify(context: LeadContext): Promise<QualifyResult> {
    const json = await this.callForJson(
      'You are a B2B sales lead qualification assistant. Respond with ONLY a JSON object, no other text, matching exactly: ' +
        '{"classification": "High" | "Medium" | "Low", "reasons": <array of short strings>}.',
      `Qualify this lead based on the following permitted context:\n${this.formatLeadContext(context)}`,
    );
    if (
      typeof json.classification !== 'string' ||
      !['High', 'Medium', 'Low'].includes(json.classification) ||
      !Array.isArray(json.reasons) ||
      !json.reasons.every((r) => typeof r === 'string')
    ) {
      throw new AiInvalidOutputError();
    }
    return { classification: json.classification, reasons: json.reasons };
  }

  async summarize(conversationText: string): Promise<SummaryResult> {
    const json = await this.callForJson(
      'You are a sales conversation summarization assistant. Respond with ONLY a JSON object, no other text, matching exactly: ' +
        '{"intent": <short string>, "painPoints": <array of short strings>, "actionItems": <array of short strings>, "nextFollowUp": <short string>}.',
      `Summarize the following sales conversation/notes:\n${conversationText}`,
    );
    if (
      typeof json.intent !== 'string' ||
      !Array.isArray(json.painPoints) ||
      !json.painPoints.every((p) => typeof p === 'string') ||
      !Array.isArray(json.actionItems) ||
      !json.actionItems.every((a) => typeof a === 'string') ||
      typeof json.nextFollowUp !== 'string'
    ) {
      throw new AiInvalidOutputError();
    }
    return {
      intent: json.intent,
      painPoints: json.painPoints,
      actionItems: json.actionItems,
      nextFollowUp: json.nextFollowUp,
    };
  }

  async generateEmail(context: EmailContext): Promise<EmailResult> {
    const json = await this.callForJson(
      'You are a B2B sales follow-up email drafting assistant. Respond with ONLY a JSON object, no other text, matching exactly: ' +
        '{"subject": <short string>, "body": <string, plain text with \\n line breaks>}.',
      `Draft a follow-up email for:\nLead name: ${context.leadName}\nCompany: ${context.companyName ?? 'unknown'}\n` +
        `Job title: ${context.jobTitle ?? 'unknown'}\nDesired tone: ${context.tone ?? 'professional'}`,
    );
    if (typeof json.subject !== 'string' || typeof json.body !== 'string') {
      throw new AiInvalidOutputError();
    }
    return { subject: json.subject, body: json.body };
  }

  private formatLeadContext(context: LeadContext): string {
    return [
      `Industry: ${context.industry ?? 'unknown'}`,
      `Job title: ${context.jobTitle ?? 'unknown'}`,
      `Budget: ${context.budget ?? 'unknown'}`,
      `Company: ${context.companyName ?? 'unknown'}`,
      `Company size: ${context.companySize ?? 'unknown'}`,
      `Source: ${context.source ?? 'unknown'}`,
      `Recent activity: ${context.recentActivity.length > 0 ? context.recentActivity.join('; ') : 'none logged'}`,
    ].join('\n');
  }

  private async callForJson(systemPrompt: string, userPrompt: string): Promise<Record<string, unknown>> {
    let text: string;
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });
      const block = response.content[0];
      if (!block || block.type !== 'text') {
        throw new AiInvalidOutputError();
      }
      text = block.text;
    } catch (err) {
      if (err instanceof AiInvalidOutputError) throw err;
      // Network error, timeout, rate limit, 5xx, auth failure — all provider
      // availability problems from the caller's perspective, and the SDK's
      // own error message is not guaranteed safe to show a user (NFR-039).
      throw new AiProviderUnavailableError();
    }

    try {
      return JSON.parse(this.stripMarkdownFence(text)) as Record<string, unknown>;
    } catch {
      throw new AiInvalidOutputError();
    }
  }

  // Models sometimes wrap JSON in a ```json ... ``` fence despite being
  // asked not to — strip it rather than rejecting an otherwise-valid response.
  private stripMarkdownFence(text: string): string {
    const trimmed = text.trim();
    const fenceMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
    return fenceMatch ? fenceMatch[1] : trimmed;
  }
}
