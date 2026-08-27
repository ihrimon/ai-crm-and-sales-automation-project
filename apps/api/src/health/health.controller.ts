import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';

// AC-030 — "The application provides an appropriate mechanism for verifying
// service health." Unauthenticated on purpose: load balancers/orchestrators
// hit this before a request ever carries a JWT. @Public() is required here
// (M1) because the global JwtAuthGuard applies to every route regardless of
// setGlobalPrefix's `exclude` — that option only affects path prefixing, not
// the guard.
@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
