import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ActivityModule } from './activity/activity.module';
import { AiModule } from './ai/ai.module';
import { AuthModule } from './auth/auth.module';
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
import { OrganizationModule } from './organization/organization.module';
import { PipelineModule } from './pipeline/pipeline.module';
import { TaskModule } from './task/task.module';

// Feature modules (Automation, Notification, Audit) land here one at a time,
// per docs/development-plan/README.md's M7–M8. Every request passes
// through, in order (architecture/README.md §6.1): JwtAuthGuard (who are
// you?) -> RbacGuard (are you allowed?) -> TenantScopeInterceptor (attach +
// enforce organizationId). Nest runs all global guards before any global
// interceptor, in registration order, which is exactly this order for free.
// AiModule (M6) is the first module with work that happens *outside* that
// per-request pipeline — see AiProcessor / TenantContextService for how a
// background job re-establishes tenant scope on its own.
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
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
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RbacGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantScopeInterceptor },
    { provide: APP_INTERCEPTOR, useClass: DecimalSerializationInterceptor },
  ],
})
export class AppModule {}
