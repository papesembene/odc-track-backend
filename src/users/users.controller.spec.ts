import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController', () => {
  let controller: UsersController;

  beforeEach(() => {
    const usersServiceMock = {} as unknown as UsersService;
    controller = new UsersController(usersServiceMock);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
