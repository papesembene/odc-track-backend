import { ApprenantsService } from './apprenants.service';

describe('ApprenantsService', () => {
  let service: ApprenantsService;

  beforeEach(() => {
    service = new ApprenantsService({} as any);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
