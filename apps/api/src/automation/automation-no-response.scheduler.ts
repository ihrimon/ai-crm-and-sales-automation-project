import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { AUTOMATION_QUEUE_NAME, NO_RESPONSE_SWEEP_INTERVAL_MS, NO_RESPONSE_SWEEP_JOB } from '../common/queue/queue.module';

// Registers the NO_RESPONSE sweep as a BullMQ repeatable job once at
// startup. A fixed jobId means re-registering on every app restart doesn't
// pile up duplicate repeat schedules — BullMQ keys a repeatable job's
// identity off it.
//
// Skipped entirely under NODE_ENV=test (Jest's own default, unless already
// set — see jest docs): every integration test calls bootstrapTestApp(),
// each standing up a full app instance against the same real Postgres/Redis
// the whole suite shares. A real repeat schedule firing mid-suite runs
// AutomationNoResponseService.sweep() — which iterates every organization
// currently in the test database — concurrently with whatever other
// integration tests happen to be mid-flight, competing for the same DB
// connections. Caught this for real: it was flaking unrelated AI
// integration tests (ai-analysis.integration.spec.ts's QUALIFICATION/SUMMARY
// cases) under a full parallel `pnpm test` run, passing in isolation.
@Injectable()
export class AutomationNoResponseScheduler implements OnModuleInit {
  constructor(@InjectQueue(AUTOMATION_QUEUE_NAME) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;
    await this.queue.add(
      NO_RESPONSE_SWEEP_JOB,
      {},
      { repeat: { every: NO_RESPONSE_SWEEP_INTERVAL_MS }, jobId: NO_RESPONSE_SWEEP_JOB },
    );
  }
}
