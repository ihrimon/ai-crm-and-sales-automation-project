import { Controller, Get } from '@nestjs/common';
import { DashboardService } from './dashboard.service';

// FR-033–FR-035, matching docs/api/openapi.yaml's Dashboard group. No
// @Roles() — every authenticated org member can view (x-roles includes
// VIEWER); RBAC narrows per-endpoint elsewhere, not here.
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('metrics')
  getMetrics() {
    return this.dashboardService.getMetrics();
  }
}
