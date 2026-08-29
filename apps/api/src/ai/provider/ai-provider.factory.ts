import { ConfigService } from '@nestjs/config';
import { AnthropicProviderAdapter } from './anthropic-provider.adapter';
import { AI_PROVIDER_ADAPTER } from './ai-provider.interface';
import { StubProviderAdapter } from './stub-provider.adapter';

// Provider selection (ADR-007): picks the adapter at startup based on config,
// not a runtime branch scattered through the rest of the module. No
// ANTHROPIC_API_KEY configured -> the deterministic stub, same "feature
// works end to end without needing a real external credential yet" call M1
// made for email delivery (console-logged links instead of a real send).
export const aiProviderAdapterProvider = {
  provide: AI_PROVIDER_ADAPTER,
  useFactory: (configService: ConfigService, anthropic: AnthropicProviderAdapter, stub: StubProviderAdapter) => {
    const provider = configService.get<string>('AI_PROVIDER');
    const apiKey = configService.get<string>('ANTHROPIC_API_KEY');
    return provider === 'anthropic' && apiKey ? anthropic : stub;
  },
  inject: [ConfigService, AnthropicProviderAdapter, StubProviderAdapter],
};
