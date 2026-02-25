import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateReferentielDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nom: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
