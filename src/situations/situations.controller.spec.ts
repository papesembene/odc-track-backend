import { SituationsController } from './situations.controller';
import { PromotionsService } from 'src/promotions/promotions.service';
import { SituationsService } from './situations.service';

describe('SituationsController', () => {
  let controller: SituationsController;

  beforeEach(() => {
    controller = new SituationsController(
      {} as SituationsService,
      {} as PromotionsService,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
