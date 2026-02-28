import { EntreprisesController } from './entreprises.controller';

describe('EntreprisesController', () => {
  let controller: EntreprisesController;

  beforeEach(() => {
    controller = new EntreprisesController({} as any);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
