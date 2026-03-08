import { IsOptional, IsUUID } from 'class-validator';
import { ApprenantsQueryDto } from 'src/apprenants/dto/apprenants-query.dto';

export class CoachApprenantsQueryDto extends ApprenantsQueryDto {
  // Le coach peut consulter une autre promotion, mais uniquement
  // a l'interieur de son referentiel.
  @IsOptional()
  @IsUUID()
  declare promotionId?: string;
}
