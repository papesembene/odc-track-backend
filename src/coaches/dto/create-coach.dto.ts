import { IsString, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO pour la création d'un coach
 */
export class CreateCoachDto {
  @ApiProperty({ example: 'Wane' })
  @IsString()
  @IsNotEmpty()
  nom: string;

  @ApiProperty({ example: 'Birane' })
  @IsString()
  @IsNotEmpty()
  prenom: string;

  @ApiProperty({ example: 'birane.wane@odc.sn' })
  @IsString()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'Développement Web' })
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  referentielId: string;

  @ApiPropertyOptional({ example: 'Développement Web' })
  @IsOptional()
  @IsString()
  specialite?: string;
}
