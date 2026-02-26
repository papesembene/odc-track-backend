import { Module } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { LocalDocumentsStorageService } from './storage/local-documents-storage.service';

@Module({
  controllers: [DocumentsController],
  providers: [DocumentsService, LocalDocumentsStorageService, PrismaService],
})
export class DocumentsModule {}
