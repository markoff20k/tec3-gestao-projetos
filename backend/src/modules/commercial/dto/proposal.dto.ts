import { IsNotEmpty, IsString, IsOptional, IsNumber, IsUUID, IsEnum, IsDateString, IsInt } from 'class-validator';
import { ProposalType, ProposalStatus } from '../entities/proposal.entity';

export class CreateProposalDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsUUID()
  @IsNotEmpty()
  clientId: string;

  @IsUUID()
  @IsOptional()
  coordinatorId?: string;

  @IsEnum(ProposalType)
  @IsOptional()
  type?: ProposalType;

  @IsUUID()
  @IsOptional()
  umbrellaProposalId?: string;

  @IsDateString()
  @IsOptional()
  expectedStartDate?: string;

  @IsDateString()
  @IsOptional()
  expectedEndDate?: string;

  @IsNumber()
  @IsOptional()
  totalValue?: number;

  @IsInt()
  @IsOptional()
  estimatedHours?: number;
}

export class UpdateProposalDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsUUID()
  @IsOptional()
  clientId?: string;

  @IsUUID()
  @IsOptional()
  coordinatorId?: string;

  @IsEnum(ProposalType)
  @IsOptional()
  type?: ProposalType;

  @IsEnum(ProposalStatus)
  @IsOptional()
  status?: ProposalStatus;

  @IsUUID()
  @IsOptional()
  umbrellaProposalId?: string;

  @IsDateString()
  @IsOptional()
  expectedStartDate?: string;

  @IsDateString()
  @IsOptional()
  expectedEndDate?: string;

  @IsNumber()
  @IsOptional()
  totalValue?: number;

  @IsInt()
  @IsOptional()
  estimatedHours?: number;
}

export class CreateProposalRevisionDto {
  @IsUUID()
  @IsNotEmpty()
  proposalId: string;

  @IsString()
  @IsOptional()
  summary?: string;

  @IsString()
  @IsOptional()
  scope?: string;

  @IsString()
  @IsOptional()
  assumptions?: string;

  @IsString()
  @IsOptional()
  deliverables?: string;

  @IsNumber()
  @IsOptional()
  totalValue?: number;

  @IsInt()
  @IsOptional()
  estimatedHours?: number;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class CreateProposalExpenseDto {
  @IsUUID()
  @IsNotEmpty()
  revisionId: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsString()
  @IsOptional()
  type?: string;

  @IsNumber()
  @IsNotEmpty()
  amount: number;

  @IsInt()
  @IsOptional()
  quantity?: number;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class CreateProposalAdditiveDto {
  @IsUUID()
  @IsNotEmpty()
  revisionId: string;

  @IsUUID()
  @IsOptional()
  projectId?: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsNumber()
  @IsNotEmpty()
  value: number;

  @IsInt()
  @IsOptional()
  estimatedHours?: number;

  @IsString()
  @IsOptional()
  justification?: string;
}

export class ConvertToProjectDto {
  @IsUUID()
  @IsNotEmpty()
  proposalId: string;

  @IsString()
  @IsOptional()
  projectName?: string;

  @IsDateString()
  @IsOptional()
  startDate?: string;
}
