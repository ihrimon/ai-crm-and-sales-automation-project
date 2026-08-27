import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();

  // ADR-005 — everything lives under /api/v1/, except the infra-level health
  // check (M0, AC-030), which load balancers probe before anything carries a JWT.
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
}

bootstrap();
