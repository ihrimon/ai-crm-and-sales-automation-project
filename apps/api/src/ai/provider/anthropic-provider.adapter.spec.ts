import { ConfigService } from '@nestjs/config';

// Must run before the `./anthropic-provider.adapter` import below — with
// ts-jest (unlike babel-jest) jest.mock() calls are NOT auto-hoisted above
// imports, so source order is what actually determines whether the mock is
// registered before anthropic-provider.adapter.ts's own `require('@anthropic-ai/sdk')`
// runs.
const mockCreate = jest.fn();
jest.mock('@anthropic-ai/sdk', () => {
  // TS compiles `import Anthropic from '@anthropic-ai/sdk'` (esModuleInterop)
  // to access `.default` on the required module — the mock has to shape
  // itself the same way, not just export the constructor directly.
  return { __esModule: true, default: jest.fn().mockImplementation(() => ({ messages: { create: mockCreate } })) };
});

import { AnthropicProviderAdapter } from './anthropic-provider.adapter';
import { AiInvalidOutputError, AiProviderUnavailableError } from './ai-provider.errors';
import type { LeadContext } from './ai-provider.interface';

function textResponse(json: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(json) }] };
}

const CONTEXT: LeadContext = {
  industry: 'Software',
  jobTitle: 'VP Sales',
  budget: 50000,
  source: 'Webinar',
  companyName: 'Acme Inc',
  companySize: '200-500',
  recentActivity: ['Requested a demo'],
};

describe('AnthropicProviderAdapter', () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  function buildAdapter(): AnthropicProviderAdapter {
    const configService = { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService;
    return new AnthropicProviderAdapter(configService);
  }

  describe('score', () => {
    it('parses a well-formed response into a ScoreResult', async () => {
      mockCreate.mockResolvedValue(
        textResponse({ score: 87, classification: 'High Intent', reasons: ['Enterprise company'], recommendedAction: 'Call today' }),
      );
      const adapter = buildAdapter();

      const result = await adapter.score(CONTEXT);

      expect(result).toEqual({ score: 87, classification: 'High Intent', reasons: ['Enterprise company'], recommendedAction: 'Call today' });
    });

    it('rejects a malformed response (missing fields) with AiInvalidOutputError, the M6 force-fail case', async () => {
      mockCreate.mockResolvedValue(textResponse({ score: 87 })); // missing classification/reasons/recommendedAction
      const adapter = buildAdapter();

      await expect(adapter.score(CONTEXT)).rejects.toThrow(AiInvalidOutputError);
    });

    it('rejects a score outside 0-100 with AiInvalidOutputError', async () => {
      mockCreate.mockResolvedValue(textResponse({ score: 150, classification: 'x', reasons: [], recommendedAction: 'y' }));
      const adapter = buildAdapter();

      await expect(adapter.score(CONTEXT)).rejects.toThrow(AiInvalidOutputError);
    });

    it('strips a markdown code fence around the JSON before parsing', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: '```json\n{"score": 60, "classification": "Medium", "reasons": [], "recommendedAction": "Follow up"}\n```' }],
      });
      const adapter = buildAdapter();

      const result = await adapter.score(CONTEXT);
      expect(result.score).toBe(60);
    });

    it('wraps a network/timeout failure as AiProviderUnavailableError, never the raw SDK error', async () => {
      mockCreate.mockRejectedValue(new Error('ECONNRESET: connection reset by peer, api key: sk-ant-secret123'));
      const adapter = buildAdapter();

      const rejection = adapter.score(CONTEXT);
      await expect(rejection).rejects.toThrow(AiProviderUnavailableError);
      await expect(rejection).rejects.not.toThrow(/sk-ant-secret123/);
    });

    it('rejects non-JSON text output with AiInvalidOutputError', async () => {
      mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'Sure, here is the score: 87' }] });
      const adapter = buildAdapter();

      await expect(adapter.score(CONTEXT)).rejects.toThrow(AiInvalidOutputError);
    });
  });

  describe('qualify', () => {
    it('rejects a classification outside High/Medium/Low', async () => {
      mockCreate.mockResolvedValue(textResponse({ classification: 'Maybe', reasons: [] }));
      const adapter = buildAdapter();

      await expect(adapter.qualify(CONTEXT)).rejects.toThrow(AiInvalidOutputError);
    });

    it('accepts a valid qualification', async () => {
      mockCreate.mockResolvedValue(textResponse({ classification: 'High', reasons: ['Decision maker'] }));
      const adapter = buildAdapter();

      await expect(adapter.qualify(CONTEXT)).resolves.toEqual({ classification: 'High', reasons: ['Decision maker'] });
    });
  });

  describe('summarize', () => {
    it('parses the structured Intent/PainPoints/ActionItems/NextFollowUp shape', async () => {
      mockCreate.mockResolvedValue(
        textResponse({ intent: 'Evaluate pricing', painPoints: ['Budget constraints'], actionItems: ['Send proposal'], nextFollowUp: 'Next Tuesday' }),
      );
      const adapter = buildAdapter();

      await expect(adapter.summarize('Some conversation text')).resolves.toEqual({
        intent: 'Evaluate pricing',
        painPoints: ['Budget constraints'],
        actionItems: ['Send proposal'],
        nextFollowUp: 'Next Tuesday',
      });
    });
  });

  describe('generateEmail', () => {
    it('parses a subject/body response', async () => {
      mockCreate.mockResolvedValue(textResponse({ subject: 'Following up', body: 'Hi Jane,\n\nThanks for your time.' }));
      const adapter = buildAdapter();

      await expect(
        adapter.generateEmail({ leadName: 'Jane', companyName: 'Acme', jobTitle: 'VP', tone: 'friendly' }),
      ).resolves.toEqual({ subject: 'Following up', body: 'Hi Jane,\n\nThanks for your time.' });
    });
  });
});
