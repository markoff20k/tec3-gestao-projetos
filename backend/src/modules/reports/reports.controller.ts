import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../auth/entities/user.entity';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Get('dashboard')
  getDashboard() {
    return this.reportsService.getDashboardMetrics();
  }

  @Get('hours')
  @Roles(UserRole.ADMIN, UserRole.COORDINATOR)
  getHoursReport(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.reportsService.getHoursReport(startDate, endDate);
  }

  @Get('proposals')
  @Roles(UserRole.ADMIN, UserRole.COMMERCIAL)
  getProposalsReport() {
    return this.reportsService.getProposalsReport();
  }

  @Get('projects')
  @Roles(UserRole.ADMIN, UserRole.COORDINATOR)
  getProjectsReport() {
    return this.reportsService.getProjectsReport();
  }

  @Get('clients')
  @Roles(UserRole.ADMIN, UserRole.COMMERCIAL)
  getClientsReport() {
    return this.reportsService.getClientsReport();
  }
}
