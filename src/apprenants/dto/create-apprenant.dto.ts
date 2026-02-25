import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateApprenantDto {
  @IsUUID()
  userId: string;

  @IsUUID()
  referentielId: string;

  @IsUUID()
  promotionId: string;

  @IsOptional()
  @IsDateString()
  dateNaissance?: string;

  @IsString()
  @IsOptional()
  telephone?: string;

  @IsString()
  @IsEnum({ HOMME: 'Homme', FEMME: 'Femme' })
  genre: string;

  @IsString()
  adresse: string;
}
