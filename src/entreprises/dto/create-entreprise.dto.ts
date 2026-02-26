import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateEntrepriseDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nom: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  secteur?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  adresse?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  telephone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(120)
  email?: string;
}
