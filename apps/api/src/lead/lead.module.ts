import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AutomationModule } from '../automation/automation.module';
import { LeadController } from './lead.controller';
import { LeadService } from './lead.service';

@Module({
  imports: [AutomationModule, AuditModule],
  controllers: [LeadController],
  providers: [LeadService],
})
export class LeadModule {}
