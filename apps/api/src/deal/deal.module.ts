import { Module } from '@nestjs/common';
import { AutomationModule } from '../automation/automation.module';
import { DealController } from './deal.controller';
import { DealService } from './deal.service';

@Module({
  imports: [AutomationModule],
  controllers: [DealController],
  providers: [DealService],
})
export class DealModule {}
