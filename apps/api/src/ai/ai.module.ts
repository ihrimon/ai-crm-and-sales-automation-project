import { Module } from '@nestjs/common';
import { QueueModule } from '../common/queue/queue.module';
import { AiAnalysisController } from './ai-analysis.controller';
import { AiAnalysisService } from './ai-analysis.service';
import { AiProcessor } from './ai.processor';
import { EmailDraftController } from './email-draft.controller';
import { EmailDraftService } from './email-draft.service';
import { LeadEmailDraftController } from './lead-email-draft.controller';
import { AnthropicProviderAdapter } from './provider/anthropic-provider.adapter';
import { aiProviderAdapterProvider } from './provider/ai-provider.factory';
import { StubProviderAdapter } from './provider/stub-provider.adapter';

@Module({
  imports: [QueueModule],
  controllers: [AiAnalysisController, LeadEmailDraftController, EmailDraftController],
  providers: [
    AiAnalysisService,
    EmailDraftService,
    AiProcessor,
    AnthropicProviderAdapter,
    StubProviderAdapter,
    aiProviderAdapterProvider,
  ],
})
export class AiModule {}
