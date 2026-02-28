import { StatistiquesController } from './statistiques.controller';

describe('StatistiquesController', () => {
  let controller: StatistiquesController;

  beforeEach(() => {
    controller = new StatistiquesController({} as any);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
