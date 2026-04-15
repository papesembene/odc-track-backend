import { STATUT } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class SituationsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsUUID()
  apprenantId?: string;

  @IsOptional()
  @IsUUID()
  entrepriseId?: string;

  @IsOptional()
  @IsUUID()
  promotionId?: string;

  @IsOptional()
  @IsUUID()
  referentielId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(STATUT)
  statut?: STATUT;

  @IsOptional()
  @Type(() => Boolean)
  valide?: boolean;

  @IsOptional()
  @IsDateString()
  dateDebutFrom?: string;

  @IsOptional()
  @IsDateString()
  dateDebutTo?: string;

  @IsOptional()
  @IsIn(['createdAt', 'dateDebut', 'dateValidation'])
  sortBy?: 'createdAt' | 'dateDebut' | 'dateValidation';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}
