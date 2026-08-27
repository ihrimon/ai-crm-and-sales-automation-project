import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// Global so every feature module can inject PrismaService without each one
// re-importing it — matches "no module reaches into another module's tables
// directly" (architecture/README.md §5) while still sharing one client/pool.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
