import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { LocalDocumentsStorageService } from './storage/local-documents-storage.service';

@Module({
  controllers: [DocumentsController],
  providers: [DocumentsService, LocalDocumentsStorageService],
})
export class DocumentsModule {}
