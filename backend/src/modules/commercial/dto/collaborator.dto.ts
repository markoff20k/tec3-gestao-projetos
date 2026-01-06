import { IsNotEmpty, IsString, IsOptional, IsNumber, IsUUID, IsEmail, IsEnum } from 'class-validator';
import { EmploymentStatus } from '../entities/collaborator.entity';

export class CreateCollaboratorDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsUUID()
  @IsNotEmpty()
  categoryId: string;

  @IsNumber()
  @IsOptional()
  costRate?: number;
}

export class UpdateCollaboratorDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsUUID()
  @IsOptional()
  categoryId?: string;

  @IsEnum(EmploymentStatus)
  @IsOptional()
  status?: EmploymentStatus;

  @IsNumber()
  @IsOptional()
  costRate?: number;
}
