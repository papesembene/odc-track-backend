import { PromotionsService } from './promotions.service';
import { CacheVersionService } from 'src/common/services/cache-version.service';
import { InOdcClientService } from 'src/integrations/in-odc/in-odc-client.service';
import { PrismaService } from 'src/prisma/prisma.service';

describe('PromotionsService', () => {
  let service: PromotionsService;

  beforeEach(() => {
    service = new PromotionsService(
      {} as PrismaService,
      {} as CacheVersionService,
      {} as InOdcClientService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
