import { SituationsService } from './situations.service';

describe('SituationsService', () => {
  let service: SituationsService;

  beforeEach(() => {
    service = new SituationsService({} as any);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
