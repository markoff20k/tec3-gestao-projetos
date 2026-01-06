import { IsNotEmpty, IsString, IsOptional, IsNumber, IsUUID, IsEnum, IsDateString, IsInt, IsBoolean } from 'class-validator';
import { ProjectStatus } from '../entities/project.entity';
import { TimeEntryStatus } from '../entities/time-entry.entity';

export class CreateProjectDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsUUID()
  @IsNotEmpty()
  clientId: string;

  @IsUUID()
  @IsOptional()
  coordinatorId?: string;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsInt()
  @IsOptional()
  budgetHours?: number;

  @IsNumber()
  @IsOptional()
  budgetValue?: number;

  @IsBoolean()
  @IsOptional()
  requiresApproval?: boolean;

  @IsInt()
  @IsOptional()
  dailyLimitHours?: number;
}

export class UpdateProjectDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsUUID()
  @IsOptional()
  clientId?: string;

  @IsUUID()
  @IsOptional()
  coordinatorId?: string;

  @IsEnum(ProjectStatus)
  @IsOptional()
  status?: ProjectStatus;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsInt()
  @IsOptional()
  budgetHours?: number;

  @IsNumber()
  @IsOptional()
  budgetValue?: number;

  @IsBoolean()
  @IsOptional()
  requiresApproval?: boolean;

  @IsInt()
  @IsOptional()
  dailyLimitHours?: number;
}

export class CreateTimeEntryDto {
  @IsUUID()
  @IsNotEmpty()
  projectId: string;

  @IsUUID()
  @IsNotEmpty()
  collaboratorId: string;

  @IsDateString()
  @IsNotEmpty()
  entryDate: string;

  @IsNumber()
  @IsNotEmpty()
  hours: number;

  @IsString()
  @IsOptional()
  description?: string;
}

export class UpdateTimeEntryDto {
  @IsDateString()
  @IsOptional()
  entryDate?: string;

  @IsNumber()
  @IsOptional()
  hours?: number;

  @IsString()
  @IsOptional()
  description?: string;
}

export class ApproveTimeEntryDto {
  @IsEnum(TimeEntryStatus)
  @IsNotEmpty()
  status: TimeEntryStatus;

  @IsString()
  @IsOptional()
  rejectionReason?: string;
}

export class CreateProjectAssignmentDto {
  @IsUUID()
  @IsNotEmpty()
  projectId: string;

  @IsUUID()
  @IsNotEmpty()
  collaboratorId: string;

  @IsString()
  @IsOptional()
  role?: string;

  @IsInt()
  @IsOptional()
  allocationPercentage?: number;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;
}
