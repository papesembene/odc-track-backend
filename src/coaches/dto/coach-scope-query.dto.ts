import { IsOptional, IsUUID } from 'class-validator';

export class CoachScopeQueryDto {
  // Filtre local du coach. S'il n'est pas fourni, on utilise la promotion active.
  @IsOptional()
  @IsUUID()
  promotionId?: string;
}
