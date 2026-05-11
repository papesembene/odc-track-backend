import { ReferentielsController } from './referentiels.controller';
import { ReferentielsService } from './referentiels.service';

describe('ReferentielsController', () => {
  let controller: ReferentielsController;

  beforeEach(() => {
    controller = new ReferentielsController({} as ReferentielsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
