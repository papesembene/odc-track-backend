import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ValidateSituationDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  commentaire?: string;
}
