import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CacheVersionService } from './services/cache-version.service';
import { DOCUMENTS_STORAGE } from './storage/documents-storage.interface';
import { LocalDocumentsStorageService } from './storage/local-documents-storage.service';
import { BackblazeB2DocumentsStorageService } from './storage/backblaze-b2-documents-storage.service';

@Global()
@Module({
  providers: [
    CacheVersionService,
    LocalDocumentsStorageService,
    BackblazeB2DocumentsStorageService,
    {
      provide: DOCUMENTS_STORAGE,
      inject: [
        ConfigService,
        LocalDocumentsStorageService,
        BackblazeB2DocumentsStorageService,
      ],
      useFactory: (
        configService: ConfigService,
        localStorage: LocalDocumentsStorageService,
        backblazeB2Storage: BackblazeB2DocumentsStorageService,
      ) => {
        const driver = (
          configService.get<string>('STORAGE_DRIVER') ?? 'local'
        ).toLowerCase();

        // Le driver reste interchangeable via l'env pour éviter tout lock-in
        // à un provider spécifique.
        return driver === 'b2' ? backblazeB2Storage : localStorage;
      },
    },
  ],
  exports: [CacheVersionService, DOCUMENTS_STORAGE],
})
export class CommonModule {}
