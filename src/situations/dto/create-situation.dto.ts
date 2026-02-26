import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { STATUT } from '@prisma/client';

export class CreateSituationDto {
  @IsUUID()
  apprenantId: string;

  @IsEnum(STATUT)
  statut: STATUT;

  @IsDateString()
  dateDebut: string;

  @IsOptional()
  @IsDateString()
  dateFin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  commentaire?: string;

  @IsOptional()
  @IsBoolean()
  valide?: boolean;

  @IsOptional()
  @IsDateString()
  dateValidation?: string;

  @IsOptional()
  @IsUUID()
  entrepriseId?: string;
}
