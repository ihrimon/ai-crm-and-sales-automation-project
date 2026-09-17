import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Phase 16 (Security Review): standard security response headers
  // (X-Content-Type-Options, HSTS, etc.) — never wired up through M0-M8.
  app.use(helmet());

  // Phase 16: enableCors() with no options reflects *any* origin, which is
  // fine for local dev but wrong for a real deployment of a multi-tenant
  // app. CORS_ORIGIN is a comma-separated allowlist; unset falls back to the
  // local Next.js dev server only, never "allow everything," in every
  // environment including production.
  const corsOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({ origin: corsOrigins, credentials: true });

  // ADR-005 — everything lives under /api/v1/, except the infra-level health
  // check (M0, AC-030), which load balancers probe before anything carries a JWT.
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
}

bootstrap();
