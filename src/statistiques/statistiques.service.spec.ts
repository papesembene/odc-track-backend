import { StatistiquesService } from './statistiques.service';
import { CacheVersionService } from 'src/common/services/cache-version.service';
import { MasterDataSyncService } from 'src/master-data/master-data-sync.service';
import { PrismaService } from 'src/prisma/prisma.service';

describe('StatistiquesService', () => {
  let service: StatistiquesService;

  beforeEach(() => {
    service = new StatistiquesService(
      {} as PrismaService,
      {} as CacheVersionService,
      {} as MasterDataSyncService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
