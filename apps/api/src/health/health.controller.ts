import { Controller, Get, Res } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../common/prisma/prisma.service';
import { AI_QUEUE_NAME } from '../common/queue/queue.module';

// AC-030 — "The application provides an appropriate mechanism for verifying
// service health." Phase 19 (Monitoring): this used to unconditionally
// return `{ status: 'ok' }` regardless of whether the app could actually
// reach Postgres or Redis — a health check that always says "ok" tells an
// orchestrator (Railway) nothing it can act on. Now it actually probes both,
// and returns 503 (not 200) when either is unreachable, so a real outage is
// visible and restart-able instead of silently reported healthy.
//
// Unauthenticated on purpose: load balancers/orchestrators hit this before a
// request ever carries a JWT. @Public() is required here (M1) because the
// global JwtAuthGuard applies to every route regardless of setGlobalPrefix's
// `exclude` — that option only affects path prefixing, not the guard.
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(AI_QUEUE_NAME) private readonly aiQueue: Queue,
  ) {}

  @Public()
  @Get()
  async check(@Res() res: Response): Promise<void> {
    const [databaseOk, redisOk] = await Promise.all([this.checkDatabase(), this.checkRedis()]);
    const healthy = databaseOk && redisOk;

    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      checks: {
        database: databaseOk ? 'ok' : 'down',
        redis: redisOk ? 'ok' : 'down',
      },
    });
  }

  private async checkDatabase(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  private async checkRedis(): Promise<boolean> {
    try {
      // BullMQ's IRedisClient abstracts over ioredis/node-redis/Bun's client
      // and doesn't declare `ping()` (not every adapter has one) — `info()`
      // is in the shared interface and still forces a real round trip.
      const client = await this.aiQueue.client;
      await client.info();
      return true;
    } catch {
      return false;
    }
  }
}
