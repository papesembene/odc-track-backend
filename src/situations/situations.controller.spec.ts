import { SituationsController } from './situations.controller';

describe('SituationsController', () => {
  let controller: SituationsController;

  beforeEach(() => {
    controller = new SituationsController({} as any);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
