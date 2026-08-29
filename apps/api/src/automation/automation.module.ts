import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { QueueModule } from '../common/queue/queue.module';
import { AutomationActionService } from './automation-action.service';
import { AutomationExecutionController } from './automation-execution.controller';
import { AutomationExecutionService } from './automation-execution.service';
import { AutomationNoResponseProcessor } from './automation-no-response.processor';
import { AutomationNoResponseScheduler } from './automation-no-response.scheduler';
import { AutomationNoResponseService } from './automation-no-response.service';
import { AutomationTriggerService } from './automation-trigger.service';
import { AutomationController } from './automation.controller';
import { AutomationService } from './automation.service';

// FR-042–FR-045, FR-052 🔎. Imports AiModule for AI_PROVIDER_ADAPTER
// (AutomationExecutionService.approve()'s CALL_AI email draft) — re-exported
// from AiModule the same way any other feature module's providers are.
@Module({
  imports: [QueueModule, AiModule],
  controllers: [AutomationController, AutomationExecutionController],
  providers: [
    AutomationService,
    AutomationTriggerService,
    AutomationActionService,
    AutomationExecutionService,
    AutomationNoResponseService,
    AutomationNoResponseProcessor,
    AutomationNoResponseScheduler,
  ],
  exports: [AutomationTriggerService],
})
export class AutomationModule {}
