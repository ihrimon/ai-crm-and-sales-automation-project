// ADR-007: errors an adapter throws must distinguish two cases the
// processor handles differently (FR-041, NFR-039, UC-014):
//   - transient (network/timeout/rate-limit): worth retrying via BullMQ's
//     built-in backoff (ADR-006).
//   - invalid output (a response came back but failed shape validation):
//     retrying won't fix a malformed response format, so this fails
//     immediately instead of burning through retry attempts.
// Both messages must already be safe to show a user — never the provider's
// raw error text/stack trace.
export class AiProviderUnavailableError extends Error {
  constructor(message = 'The AI provider is temporarily unavailable. Please try again shortly.') {
    super(message);
    this.name = 'AiProviderUnavailableError';
  }
}

export class AiInvalidOutputError extends Error {
  constructor(message = 'The AI provider returned an unexpected response.') {
    super(message);
    this.name = 'AiInvalidOutputError';
  }
}
