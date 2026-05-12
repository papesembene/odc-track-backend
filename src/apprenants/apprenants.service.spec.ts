import { ApprenantsService } from './apprenants.service';
import { EmailService } from 'src/email/email.service';
import { InOdcClientService } from 'src/integrations/in-odc/in-odc-client.service';
import { PrismaService } from 'src/prisma/prisma.service';
import type { DocumentsStorageService } from 'src/common/storage/documents-storage.interface';

describe('ApprenantsService', () => {
  let service: ApprenantsService;

  beforeEach(() => {
    service = new ApprenantsService(
      {} as PrismaService,
      {} as InOdcClientService,
      {} as EmailService,
      {} as DocumentsStorageService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
