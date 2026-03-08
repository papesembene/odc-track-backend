export interface DocumentsStorageContext {
  apprenantId?: string;
  situationId?: string | null;
  documentType?: string;
}

export interface DocumentsStorageService {
  save(
    file: Express.Multer.File,
    context?: DocumentsStorageContext,
  ): Promise<string>;
  remove(storedPath: string): Promise<void>;
  resolveAccessPath(storedPath: string): string | Promise<string>;
}

export const DOCUMENTS_STORAGE = 'DOCUMENTS_STORAGE';
