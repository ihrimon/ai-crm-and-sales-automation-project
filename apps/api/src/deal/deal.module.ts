import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AutomationModule } from '../automation/automation.module';
import { DealController } from './deal.controller';
import { DealService } from './deal.service';

@Module({
  imports: [AutomationModule, AuditModule],
  controllers: [DealController],
  providers: [DealService],
})
export class DealModule {}
