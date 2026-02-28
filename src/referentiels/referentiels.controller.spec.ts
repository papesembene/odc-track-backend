import { ReferentielsController } from './referentiels.controller';

describe('ReferentielsController', () => {
  let controller: ReferentielsController;

  beforeEach(() => {
    controller = new ReferentielsController({} as any);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
