import { UsersController } from './users.controller';

describe('UsersController', () => {
  let controller: UsersController;

  beforeEach(() => {
    controller = new UsersController({} as any);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
