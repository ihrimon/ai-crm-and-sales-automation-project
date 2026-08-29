import { Module } from '@nestjs/common';
import { AutomationModule } from '../automation/automation.module';
import { LeadController } from './lead.controller';
import { LeadService } from './lead.service';

@Module({
  imports: [AutomationModule],
  controllers: [LeadController],
  providers: [LeadService],
})
export class LeadModule {}
