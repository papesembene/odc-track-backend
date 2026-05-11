import { SituationsService } from './situations.service';
import { PrismaService } from 'src/prisma/prisma.service';
import type { DocumentsStorageService } from 'src/common/storage/documents-storage.interface';

describe('SituationsService', () => {
  let service: SituationsService;

  beforeEach(() => {
    service = new SituationsService(
      {} as PrismaService,
      {} as DocumentsStorageService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
