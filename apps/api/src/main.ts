import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { requestLoggerMiddleware } from './common/middleware/request-logger.middleware';

// Phase 19 (Monitoring): neither of these was wired up through M0-M18 — an
// uncaught error outside Nest's own request lifecycle (e.g. a truly
// unexpected synchronous throw, or a rejected promise nothing awaited) would
// otherwise surface as a raw, unlabelled stack trace in Railway's log viewer
// with no indication of what crashed the process or why. Logging first, then
// preserving Node's own default behavior (exit non-zero on an uncaught
// exception; Node 15+ already does this for unhandled rejections) keeps
// Railway's container-restart behavior unchanged while making the log line
// that explains the restart actually legible.
process.on('uncaughtException', (err) => {
  new Logger('Process').error('Uncaught exception, process will exit', err.stack);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  new Logger('Process').error('Unhandled promise rejection', reason instanceof Error ? reason.stack : String(reason));
});

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Phase 19: structured access logging + a per-request correlation ID —
  // see request-logger.middleware.ts for why this didn't exist before.
  app.use(requestLoggerMiddleware);

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
