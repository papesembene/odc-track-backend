import { Injectable } from '@nestjs/common';
import { mkdir, rm, writeFile } from 'fs/promises';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import {
  DocumentsStorageContext,
  DocumentsStorageService,
} from './documents-storage.interface';

@Injectable()
export class LocalDocumentsStorageService implements DocumentsStorageService {
  private readonly uploadDir = 'uploads/documents';

  /**
   * Persiste un fichier dans le stockage local et retourne son chemin relatif.
   * On garde un chemin relatif pour rester compatible avec l'exposition statique
   * déjà en place sur /uploads.
   */
  async save(
    file: Express.Multer.File,
    context?: DocumentsStorageContext,
  ): Promise<string> {
    const targetDir = this.buildTargetDirectory(context);
    await mkdir(targetDir, { recursive: true });

    const extension = extname(file.originalname).toLowerCase();
    const baseName = this.sanitizeName(
      file.originalname.replace(extension, ''),
    );
    const finalName = `${Date.now()}-${randomUUID()}-${baseName}${extension}`;
    const filePath = `${targetDir}/${finalName}`;

    await writeFile(filePath, file.buffer);
    return filePath;
  }

  /**
   * Supprime un fichier du stockage local.
   * La suppression est silencieuse si le fichier n'existe plus.
   */
  async remove(filePath: string): Promise<void> {
    if (!filePath) return;
    if (!filePath.startsWith(`${this.uploadDir}/`)) return;
    await rm(filePath, { force: true });
  }

  /**
   * Convertit le chemin stocké en chemin HTTP local exploitable par le frontend.
   */
  resolveAccessPath(storedPath: string): string {
    if (!storedPath) return '';
    return storedPath.startsWith('/') ? storedPath : `/${storedPath}`;
  }

  private buildTargetDirectory(context?: DocumentsStorageContext): string {
    if (context?.situationId) {
      return `${this.uploadDir}/situations/${context.situationId}`;
    }

    if (context?.apprenantId && context.documentType === 'CV') {
      return `${this.uploadDir}/apprenants/${context.apprenantId}/cv`;
    }

    if (context?.apprenantId) {
      return `${this.uploadDir}/apprenants/${context.apprenantId}`;
    }

    return this.uploadDir;
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
