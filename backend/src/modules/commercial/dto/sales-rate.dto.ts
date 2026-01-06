import { IsNotEmpty, IsString, IsOptional, IsNumber, IsUUID, IsDateString, IsBoolean } from 'class-validator';

export class CreateSalesRateDto {
  @IsUUID()
  @IsNotEmpty()
  categoryId: string;

  @IsNumber()
  @IsNotEmpty()
  hourlyRate: number;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsDateString()
  @IsOptional()
  validFrom?: string;

  @IsDateString()
  @IsOptional()
  validTo?: string;
}

export class UpdateSalesRateDto {
  @IsNumber()
  @IsOptional()
  hourlyRate?: number;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsDateString()
  @IsOptional()
  validFrom?: string;

  @IsDateString()
  @IsOptional()
  validTo?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
