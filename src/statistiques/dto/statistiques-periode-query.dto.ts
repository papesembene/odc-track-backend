import { IsDateString, IsOptional } from 'class-validator';

export class StatistiquesPeriodeQueryDto {
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
