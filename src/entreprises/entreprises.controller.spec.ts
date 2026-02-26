import { Test, TestingModule } from '@nestjs/testing';
import { EntreprisesController } from './entreprises.controller';

describe('EntreprisesController', () => {
  let controller: EntreprisesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EntreprisesController],
    }).compile();

    controller = module.get<EntreprisesController>(EntreprisesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
