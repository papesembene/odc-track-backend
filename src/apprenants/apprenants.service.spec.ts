import { Test, TestingModule } from '@nestjs/testing';
import { ApprenantsService } from './apprenants.service';

describe('ApprenantsService', () => {
  let service: ApprenantsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ApprenantsService],
    }).compile();

    service = module.get<ApprenantsService>(ApprenantsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
