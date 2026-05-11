import { EntreprisesController } from './entreprises.controller';
import { EntreprisesService } from './entreprises.service';

describe('EntreprisesController', () => {
  let controller: EntreprisesController;

  beforeEach(() => {
    controller = new EntreprisesController({} as EntreprisesService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
