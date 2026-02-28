import { ApprenantsController } from './apprenants.controller';

describe('ApprenantsController', () => {
  let controller: ApprenantsController;

  beforeEach(() => {
    controller = new ApprenantsController({} as any);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
