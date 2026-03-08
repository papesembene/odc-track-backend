import { Module } from '@nestjs/common';
import { StatistiquesController } from './statistiques.controller';
import { StatistiquesService } from './statistiques.service';
import { PromotionsModule } from '../promotions/promotions.module';

@Module({
  imports: [PromotionsModule],
  controllers: [StatistiquesController],
  providers: [StatistiquesService],
})
export class StatistiquesModule {}
