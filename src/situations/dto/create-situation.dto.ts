import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { STATUT } from '@prisma/client';

export class CreateSituationDto {
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
  @IsUUID()
  entrepriseId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  nomEntrepriseLibre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  secteurEntrepriseLibre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  adresseEntrepriseLibre?: string;
}
