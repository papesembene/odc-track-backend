import { ApprenantsService } from './apprenants.service';
import { InOdcClientService } from 'src/integrations/in-odc/in-odc-client.service';
import { PrismaService } from 'src/prisma/prisma.service';
import type { DocumentsStorageService } from 'src/common/storage/documents-storage.interface';

describe('ApprenantsService', () => {
  let service: ApprenantsService;

  beforeEach(() => {
    service = new ApprenantsService(
      {} as PrismaService,
      {} as InOdcClientService,
      {} as DocumentsStorageService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
