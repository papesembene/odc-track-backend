import { Injectable } from '@nestjs/common';
import { mkdir, writeFile } from 'fs/promises';
import { extname } from 'path';
import { randomUUID } from 'crypto';

@Injectable()
export class LocalDocumentsStorageService {
  private readonly uploadDir = 'uploads/documents';

  /**
   * Persiste un fichier dans le stockage local et retourne le chemin sauvegardé.
   */
  async save(file: Express.Multer.File): Promise<string> {
    await mkdir(this.uploadDir, { recursive: true });

    const extension = extname(file.originalname).toLowerCase();
    const baseName = this.sanitizeName(
      file.originalname.replace(extension, ''),
    );
    const finalName = `${Date.now()}-${randomUUID()}-${baseName}${extension}`;
    const filePath = `${this.uploadDir}/${finalName}`;

    await writeFile(filePath, file.buffer);
    return filePath;
  }

  /**
   * Normalise le nom du fichier pour éviter les caractères problématiques.
   */
  private sanitizeName(name: string): string {
    return name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 80);
  }
}
