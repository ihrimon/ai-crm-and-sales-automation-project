import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { TokenModule } from './common/token/token.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { HealthModule } from './health/health.module';

// Feature modules (Organization, Rbac, Crm, Activities, Dashboard, Ai,
// Automation, Notification, Audit) land here one at a time, per
// docs/development-plan/README.md's M2–M8. Milestone M1 adds Auth plus the
// shared PrismaModule/TokenModule and the global JwtAuthGuard every later
// module's routes sit behind by default.
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, TokenModule, HealthModule, AuthModule],
  providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AppModule {}
