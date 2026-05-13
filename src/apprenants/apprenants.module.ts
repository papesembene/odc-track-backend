import { Module } from '@nestjs/common';
import { ApprenantsController } from './apprenants.controller';
import { ApprenantsService } from './apprenants.service';
import { CsvParserService } from './import/csv-parser.service';
import { DateParserService } from './import/date-parser.service';
import { ApprenantRowValidatorService } from './import/apprenant-row-validator.service';
import { ApprenantsImportService } from './import/apprenants-import.service';
import { ExcelParserService } from './import/excel-parser.service';
import { PromotionApprenantsImportController } from './promotion-apprenants-import.controller';
import { ReferentielApprenantsImportController } from './referentiel-apprenants-import.controller';
import { MasterDataModule } from 'src/master-data/master-data.module';
import { PromotionsModule } from '../promotions/promotions.module';
import { EmailModule } from 'src/email/email.module';

@Module({
  imports: [PromotionsModule, EmailModule, MasterDataModule],
  controllers: [
    ApprenantsController,
    PromotionApprenantsImportController,
    ReferentielApprenantsImportController,
  ],
  providers: [
    ApprenantsService,
    CsvParserService,
    DateParserService,
    ExcelParserService,
    ApprenantRowValidatorService,
    ApprenantsImportService,
  ],
})
export class ApprenantsModule {}
