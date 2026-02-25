import { Test, TestingModule } from '@nestjs/testing';
import { ReferentielsController } from './referentiels.controller';

describe('ReferentielsController', () => {
  let controller: ReferentielsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReferentielsController],
    }).compile();

    controller = module.get<ReferentielsController>(ReferentielsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
