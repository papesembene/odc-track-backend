import { Test, TestingModule } from '@nestjs/testing';
import { ReferentielsService } from './referentiels.service';

describe('ReferentielsService', () => {
  let service: ReferentielsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ReferentielsService],
    }).compile();

    service = module.get<ReferentielsService>(ReferentielsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
