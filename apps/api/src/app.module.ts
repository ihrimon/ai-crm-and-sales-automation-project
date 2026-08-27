import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';

// Feature modules (Auth, Organization, Rbac, Crm, Activities, Dashboard, Ai,
// Automation, Notification, Audit) land here one at a time, per
// docs/development-plan/README.md's M1–M8. Nothing beyond Health exists yet —
// this is Milestone M0 (Project Setup).
@Module({
  imports: [HealthModule],
})
export class AppModule {}
