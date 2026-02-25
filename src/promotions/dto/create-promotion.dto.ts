import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreatePromotionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nom: string;

  @IsInt()
  @Min(2000)
  annee: number;

  @IsArray()
  @IsUUID('4', { each: true })
  referentielIds: string[];
}
