import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

export const AI_QUEUE_NAME = 'ai';
export const ANALYZE_LEAD_JOB = 'analyze-lead';
export const GENERATE_EMAIL_JOB = 'generate-email';
// Matches defaultJobOptions.attempts below — AiProcessor reads this to know
// whether a given attempt is the last one before giving up (see AiProcessor
// for why that distinction matters).
export const AI_JOB_MAX_ATTEMPTS = 3;

// M7 — the NO_RESPONSE trigger's periodic sweep (AutomationNoResponseService).
// A separate queue from `ai` since this is a repeatable/scheduled job, not a
// per-request enqueue, and doesn't need AI's retry/backoff policy.
export const AUTOMATION_QUEUE_NAME = 'automation';
export const NO_RESPONSE_SWEEP_JOB = 'no-response-sweep';
// Short on purpose so the sweep is actually observable in a dev/demo
// session, not "every hour" — see AutomationNoResponseProcessor.
export const NO_RESPONSE_SWEEP_INTERVAL_MS = 60_000;

// ADR-006 (docs/decisions/ADR-006-redis-bullmq.md): Redis-backed BullMQ
// queue for work that must not block the request/response cycle. The worker
// runs in-process (registered via BullModule.registerQueue, consumed by
// AiProcessor) rather than as a separate deployable — this repo has no
// separate worker entrypoint/container in docker-compose.yml or CI yet, and
// nothing about M6's scope requires one; enqueueing is still fire-and-forget
// from the HTTP handler's perspective, which is what actually keeps
// requests fast (NFR-001), not which OS process eventually drains the queue.
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: { url: configService.get<string>('REDIS_URL') },
      }),
    }),
    BullModule.registerQueue({
      name: AI_QUEUE_NAME,
      defaultJobOptions: {
        attempts: AI_JOB_MAX_ATTEMPTS,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { age: 24 * 60 * 60 },
        removeOnFail: { age: 7 * 24 * 60 * 60 },
      },
    }),
    BullModule.registerQueue({
      name: AUTOMATION_QUEUE_NAME,
      defaultJobOptions: {
        removeOnComplete: { age: 24 * 60 * 60, count: 5 },
        removeOnFail: { age: 7 * 24 * 60 * 60 },
      },
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
