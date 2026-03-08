import { UsersService } from './users.service';
import { PrismaService } from 'src/prisma/prisma.service';

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(() => {
    const prismaServiceMock = {} as unknown as PrismaService;
    service = new UsersService(prismaServiceMock);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
