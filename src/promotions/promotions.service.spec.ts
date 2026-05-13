import { PromotionsService } from './promotions.service';
import { CacheVersionService } from 'src/common/services/cache-version.service';
import { MasterDataSyncService } from 'src/master-data/master-data-sync.service';
import { PrismaService } from 'src/prisma/prisma.service';

describe('PromotionsService', () => {
  let service: PromotionsService;

  beforeEach(() => {
    service = new PromotionsService(
      {} as PrismaService,
      {} as CacheVersionService,
      {} as MasterDataSyncService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
