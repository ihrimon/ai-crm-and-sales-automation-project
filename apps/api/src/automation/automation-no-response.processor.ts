import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { AUTOMATION_QUEUE_NAME } from '../common/queue/queue.module';
import { AutomationNoResponseService } from './automation-no-response.service';

// Consumes the repeatable job AutomationNoResponseScheduler registers.
// Runs in-process, same call as AiProcessor (M6) — no separate worker
// deployable exists in this repo yet.
@Processor(AUTOMATION_QUEUE_NAME)
export class AutomationNoResponseProcessor extends WorkerHost {
  constructor(private readonly noResponseService: AutomationNoResponseService) {
    super();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async process(job: Job): Promise<void> {
    await this.noResponseService.sweep();
  }
}
