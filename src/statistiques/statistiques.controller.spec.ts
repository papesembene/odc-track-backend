import { StatistiquesController } from './statistiques.controller';
import { PromotionsService } from 'src/promotions/promotions.service';
import { StatistiquesService } from './statistiques.service';

describe('StatistiquesController', () => {
  let controller: StatistiquesController;

  beforeEach(() => {
    controller = new StatistiquesController(
      {} as StatistiquesService,
      {} as PromotionsService,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
