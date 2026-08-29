import { StubProviderAdapter } from './stub-provider.adapter';
import type { LeadContext } from './ai-provider.interface';

const RICH_CONTEXT: LeadContext = {
  industry: 'Software',
  jobTitle: 'VP Sales',
  budget: 50000,
  source: 'Webinar',
  companyName: 'Acme Inc',
  companySize: '200-500',
  recentActivity: ['Requested a demo'],
};

const EMPTY_CONTEXT: LeadContext = {
  industry: null,
  jobTitle: null,
  budget: null,
  source: null,
  companyName: null,
  companySize: null,
  recentActivity: [],
};

describe('StubProviderAdapter', () => {
  const adapter = new StubProviderAdapter();

  it('produces a well-formed, deterministic ScoreResult with no network call', async () => {
    const result = await adapter.score(RICH_CONTEXT);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(typeof result.classification).toBe('string');
    expect(Array.isArray(result.reasons)).toBe(true);
    expect(typeof result.recommendedAction).toBe('string');
  });

  it('scores a richer lead higher than one with no information', async () => {
    const rich = await adapter.score(RICH_CONTEXT);
    const empty = await adapter.score(EMPTY_CONTEXT);
    expect(rich.score).toBeGreaterThan(empty.score);
  });

  it('qualify() returns a High/Medium/Low classification', async () => {
    const result = await adapter.qualify(RICH_CONTEXT);
    expect(['High', 'Medium', 'Low']).toContain(result.classification);
  });

  it('summarize() returns all four structured fields even for empty input', async () => {
    const result = await adapter.summarize('');
    expect(result.intent).toBeTruthy();
    expect(Array.isArray(result.painPoints)).toBe(true);
    expect(Array.isArray(result.actionItems)).toBe(true);
    expect(result.nextFollowUp).toBeTruthy();
  });

  it('generateEmail() returns a non-empty subject and body', async () => {
    const result = await adapter.generateEmail({ leadName: 'Jane', companyName: 'Acme', jobTitle: 'VP', tone: 'friendly' });
    expect(result.subject.length).toBeGreaterThan(0);
    expect(result.body).toContain('Jane');
  });
});
