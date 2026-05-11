import { AuthService } from './auth.service';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InOdcClientService } from 'src/integrations/in-odc/in-odc-client.service';
import { PrismaService } from 'src/prisma/prisma.service';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    service = new AuthService(
      {} as PrismaService,
      {} as JwtService,
      {} as ConfigService,
      {} as InOdcClientService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
