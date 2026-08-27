import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

// Connects via APP_DATABASE_URL (the "crm_app" role), never DATABASE_URL
// (the "crm" role Prisma Migrate uses). `crm` is a Postgres superuser — the
// official postgres image always makes POSTGRES_USER one — and superusers
// bypass Row-Level Security entirely, which would silently defeat every RLS
// policy from docs/database/rls-policies.sql. See
// docs/database/README.md §5.6 for the full story (a real bug caught while
// building M2, verifying "RLS actually rejects a cross-org query").
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(configService: ConfigService) {
    const url = configService.get<string>('APP_DATABASE_URL');
    super(url ? { datasources: { db: { url } } } : undefined);
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
