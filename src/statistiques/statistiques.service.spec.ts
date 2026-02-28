import { StatistiquesService } from './statistiques.service';

describe('StatistiquesService', () => {
  let service: StatistiquesService;

  beforeEach(() => {
    service = new StatistiquesService({} as any);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
