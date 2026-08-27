import { Controller, Get } from '@nestjs/common';

// AC-030 — "The application provides an appropriate mechanism for verifying
// service health." Unauthenticated on purpose: load balancers/orchestrators
// hit this before a request ever carries a JWT.
@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
