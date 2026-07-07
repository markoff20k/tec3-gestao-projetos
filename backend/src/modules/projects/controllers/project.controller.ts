import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ProjectService } from '../services/project.service';
import {
  CreateProjectDto,
  UpdateProjectDto,
  CreateTimeEntryDto,
  UpdateTimeEntryDto,
  ApproveTimeEntryDto,
  CreateProjectAssignmentDto,
  UpdateProjectSetupDto,
} from '../dto/project.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { UserRole } from '../../auth/entities/user.entity';

@Controller('projects')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProjectController {
  constructor(private projectService: ProjectService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.COORDINATOR)
  create(@Body() dto: CreateProjectDto) {
    return this.projectService.create(dto);
  }

  @Get()
  findAll() {
    return this.projectService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.projectService.findOne(id);
  }

  @Get(':id/stats')
  getStats(@Param('id') id: string) {
    return this.projectService.getProjectStats(id);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN, UserRole.COORDINATOR)
  update(@Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.projectService.update(id, dto);
  }

  @Put(':id/setup')
  @Roles(UserRole.ADMIN, UserRole.COORDINATOR)
  updateSetup(@Param('id') id: string, @Body() dto: UpdateProjectSetupDto) {
    return this.projectService.updateSetup(id, dto);
  }

  @Post(':id/setup/complete')
  @Roles(UserRole.ADMIN, UserRole.COORDINATOR)
  completeSetup(@Param('id') id: string, @Request() req) {
    return this.projectService.completeSetup(id, req.user.id);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string) {
    return this.projectService.remove(id);
  }

  @Post('time-entries')
  createTimeEntry(@Body() dto: CreateTimeEntryDto, @Request() req) {
    return this.projectService.createTimeEntry(dto, req.user.id);
  }

  @Get(':id/time-entries')
  getTimeEntries(@Param('id') id: string) {
    return this.projectService.getTimeEntries(id);
  }

  @Put('time-entries/:id')
  updateTimeEntry(@Param('id') id: string, @Body() dto: UpdateTimeEntryDto) {
    return this.projectService.updateTimeEntry(id, dto);
  }

  @Post('time-entries/:id/approve')
  @Roles(UserRole.ADMIN, UserRole.COORDINATOR)
  approveTimeEntry(
    @Param('id') id: string,
    @Body() dto: ApproveTimeEntryDto,
    @Request() req,
  ) {
    return this.projectService.approveTimeEntry(id, dto, req.user.id);
  }

  @Delete('time-entries/:id')
  deleteTimeEntry(@Param('id') id: string) {
    return this.projectService.deleteTimeEntry(id);
  }

  @Post('assignments')
  @Roles(UserRole.ADMIN, UserRole.COORDINATOR)
  createAssignment(@Body() dto: CreateProjectAssignmentDto) {
    return this.projectService.createAssignment(dto);
  }

  @Get(':id/assignments')
  getAssignments(@Param('id') id: string) {
    return this.projectService.getAssignments(id);
  }

  @Delete('assignments/:id')
  @Roles(UserRole.ADMIN, UserRole.COORDINATOR)
  deleteAssignment(@Param('id') id: string) {
    return this.projectService.deleteAssignment(id);
  }
}
