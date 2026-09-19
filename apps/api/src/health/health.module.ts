import { Module } from '@nestjs/common';
import { QueueModule } from '../common/queue/queue.module';
import { HealthController } from './health.controller';

@Module({
  imports: [QueueModule],
  controllers: [HealthController],
})
export class HealthModule {}
