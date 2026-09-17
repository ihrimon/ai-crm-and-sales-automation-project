import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ActivityModule } from './activity/activity.module';
import { AiModule } from './ai/ai.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { AutomationModule } from './automation/automation.module';
import { CompanyModule } from './company/company.module';
import { ContactModule } from './contact/contact.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { DealModule } from './deal/deal.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { TokenModule } from './common/token/token.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { DecimalSerializationInterceptor } from './common/interceptors/decimal-serialization.interceptor';
import { RbacGuard } from './common/guards/rbac.guard';
import { TenantModule } from './common/tenant/tenant.module';
import { TenantScopeInterceptor } from './common/tenant/tenant-scope.interceptor';
import { HealthModule } from './health/health.module';
import { LeadModule } from './lead/lead.module';
import { NotificationModule } from './notification/notification.module';
import { OrganizationModule } from './organization/organization.module';
import { PipelineModule } from './pipeline/pipeline.module';
import { TaskModule } from './task/task.module';

// Feature modules (Notification, Audit) land here one at a time, per
// docs/development-plan/README.md's M8. Every request passes through, in
// order (architecture/README.md §6.1): JwtAuthGuard (who are you?) ->
// RbacGuard (are you allowed?) -> TenantScopeInterceptor (attach + enforce
// organizationId). Nest runs all global guards before any global
// interceptor, in registration order, which is exactly this order for free.
// AiModule (M6) is the first module with work that happens *outside* that
// per-request pipeline — see AiProcessor / TenantContextService for how a
// background job re-establishes tenant scope on its own. AutomationModule
// (M7) is imported directly by LeadModule/DealModule too, not just here —
// see AutomationTriggerService for why (LEAD_CREATED/DEAL_STAGE_CHANGED/
// DEAL_WON hook into those services' own write paths).
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Phase 16 (Security Review) — NFR-011 ("sensitive and resource-intensive
    // endpoints should use appropriate rate limiting") was never implemented
    // through M0-M8. A single global default is deliberately coarse (per-IP,
    // every route) rather than per-endpoint tuning that no FR has specified
    // yet — tighten per-route with @Throttle()/@SkipThrottle() if a real
    // abuse pattern shows up. Values are env-configurable, not hardcoded,
    // since the right limit depends on the deployment (see .env.example).
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        // Same NODE_ENV=test guard this codebase already uses for
        // AutomationNoResponseScheduler (M7): Jest's integration suites fire
        // far more than 100 requests/minute from one process against a
        // shared test server, which has nothing to do with real abuse.
        skipIf: () => process.env.NODE_ENV === 'test',
        throttlers: [
          {
            ttl: Number(config.get<string>('RATE_LIMIT_TTL_MS') ?? 60_000),
            limit: Number(config.get<string>('RATE_LIMIT_LIMIT') ?? 100),
          },
        ],
      }),
    }),
    PrismaModule,
    TokenModule,
    TenantModule,
    HealthModule,
    AuthModule,
    OrganizationModule,
    LeadModule,
    ContactModule,
    CompanyModule,
    PipelineModule,
    DealModule,
    ActivityModule,
    TaskModule,
    DashboardModule,
    AiModule,
    AutomationModule,
    AuditModule,
    NotificationModule,
  ],
  providers: [
    // Runs before JwtAuthGuard so it also covers unauthenticated/@Public()
    // routes (login, register, password-reset) — exactly the endpoints a
    // credential-stuffing/brute-force attempt targets.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RbacGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantScopeInterceptor },
    { provide: APP_INTERCEPTOR, useClass: DecimalSerializationInterceptor },
  ],
})
export class AppModule {}
