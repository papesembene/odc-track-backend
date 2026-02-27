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

@Module({
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
