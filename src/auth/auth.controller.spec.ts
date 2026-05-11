import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(() => {
    controller = new AuthController({} as AuthService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
