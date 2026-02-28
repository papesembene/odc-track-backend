import { EntreprisesService } from './entreprises.service';

describe('EntreprisesService', () => {
  let service: EntreprisesService;

  beforeEach(() => {
    service = new EntreprisesService({} as any);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
