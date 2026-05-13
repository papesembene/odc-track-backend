import { Module } from '@nestjs/common';
import { MasterDataModule } from 'src/master-data/master-data.module';
import { StatistiquesController } from './statistiques.controller';
import { StatistiquesService } from './statistiques.service';
import { PromotionsModule } from '../promotions/promotions.module';

@Module({
  imports: [PromotionsModule, MasterDataModule],
  controllers: [StatistiquesController],
  providers: [StatistiquesService],
})
export class StatistiquesModule {}
