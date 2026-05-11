import { ReferentielsService } from './referentiels.service';
import { InOdcClientService } from 'src/integrations/in-odc/in-odc-client.service';
import { PrismaService } from 'src/prisma/prisma.service';

describe('ReferentielsService', () => {
  let service: ReferentielsService;

  beforeEach(() => {
    service = new ReferentielsService(
      {} as PrismaService,
      {} as InOdcClientService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
