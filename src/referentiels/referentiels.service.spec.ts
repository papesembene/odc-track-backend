import { ReferentielsService } from './referentiels.service';
import { MasterDataSyncService } from 'src/master-data/master-data-sync.service';
import { PrismaService } from 'src/prisma/prisma.service';

describe('ReferentielsService', () => {
  let service: ReferentielsService;

  beforeEach(() => {
    service = new ReferentielsService(
      {} as PrismaService,
      {} as MasterDataSyncService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
