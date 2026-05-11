import { ApprenantsController } from './apprenants.controller';
import { ApprenantsService } from './apprenants.service';
import { PromotionsService } from 'src/promotions/promotions.service';
import { ApprenantsImportService } from './import/apprenants-import.service';
import { ExcelParserService } from './import/excel-parser.service';

describe('ApprenantsController', () => {
  let controller: ApprenantsController;

  beforeEach(() => {
    controller = new ApprenantsController(
      {} as ApprenantsService,
      {} as PromotionsService,
      {} as ApprenantsImportService,
      {} as ExcelParserService,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
