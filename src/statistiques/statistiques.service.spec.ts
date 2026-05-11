import { StatistiquesService } from './statistiques.service';
import { CacheVersionService } from 'src/common/services/cache-version.service';
import { InOdcClientService } from 'src/integrations/in-odc/in-odc-client.service';
import { PrismaService } from 'src/prisma/prisma.service';

describe('StatistiquesService', () => {
  let service: StatistiquesService;

  beforeEach(() => {
    service = new StatistiquesService(
      {} as PrismaService,
      {} as CacheVersionService,
      {} as InOdcClientService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
