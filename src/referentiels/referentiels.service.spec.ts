import { ReferentielsService } from './referentiels.service';

describe('ReferentielsService', () => {
  let service: ReferentielsService;

  beforeEach(() => {
    service = new ReferentielsService({} as any);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
