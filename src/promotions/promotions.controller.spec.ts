import { PromotionsController } from './promotions.controller';

describe('PromotionsController', () => {
  let controller: PromotionsController;

  beforeEach(() => {
    controller = new PromotionsController({} as any);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
