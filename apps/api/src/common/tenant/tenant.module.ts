import { Global, Module } from '@nestjs/common';
import { TenantContextService } from './tenant-context.service';

// Global so every feature module can inject TenantContextService, matching
// the PrismaModule/TokenModule pattern already established (M1).
@Global()
@Module({
  providers: [TenantContextService],
  exports: [TenantContextService],
})
export class TenantModule {}
