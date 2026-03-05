import { IsOptional, IsString, MaxLength, IsBoolean } from 'class-validator';

export class ValidateSituationDto {
  @IsOptional()
  @IsBoolean()
  valide?: boolean;
  @IsOptional()
  @IsString()
  @MaxLength(500)
  commentaire?: string;
}
