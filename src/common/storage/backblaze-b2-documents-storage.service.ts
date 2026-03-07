import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import {
  DocumentsStorageContext,
  DocumentsStorageService,
} from './documents-storage.interface';

@Injectable()
export class BackblazeB2DocumentsStorageService
  implements DocumentsStorageService
{
  private readonly bucketName?: string;
  private readonly signedUrlTtlSeconds: number;
  private readonly client?: S3Client;

  constructor(private readonly configService: ConfigService) {
    const endpoint = this.configService.get<string>('B2_ENDPOINT');
    const region = this.configService.get<string>('B2_REGION');
    const accessKeyId = this.configService.get<string>('B2_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>(
      'B2_SECRET_ACCESS_KEY',
    );
    const bucketName = this.configService.get<string>('B2_BUCKET_NAME');

    this.bucketName = bucketName;
    this.signedUrlTtlSeconds = Number(
      this.configService.get<string>('B2_SIGNED_URL_TTL_SECONDS') ?? '900',
    );
    if (endpoint && region && accessKeyId && secretAccessKey && bucketName) {
      this.client = new S3Client({
        endpoint,
        region,
        forcePathStyle: true,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
    }
  }

  /**
   * Upload le document dans Backblaze B2 et retourne la clé objet stockée en DB.
   * On stocke une clé stable, pas une URL temporaire, pour pouvoir régénérer
   * un lien d'accès privé à chaque lecture.
   */
  async save(
    file: Express.Multer.File,
    context?: DocumentsStorageContext,
  ): Promise<string> {
    const objectKey = this.buildObjectKey(file, context);

    await this.getClient().send(
      new PutObjectCommand({
        Bucket: this.getBucketName(),
        Key: objectKey,
        Body: file.buffer,
        ContentType: file.mimetype || 'application/octet-stream',
      }),
    );

    return objectKey;
  }

  async remove(storedPath: string): Promise<void> {
    if (!storedPath) return;

    await this.getClient().send(
      new DeleteObjectCommand({
        Bucket: this.getBucketName(),
        Key: storedPath,
      }),
    );
  }

  /**
   * Génère une URL signée courte durée pour un bucket privé.
   * Le frontend reçoit donc un lien exploitable sans exposer le bucket en public.
   */
  async resolveAccessPath(storedPath: string): Promise<string> {
    if (!storedPath) return '';

    return getSignedUrl(
      this.getClient(),
      new GetObjectCommand({
        Bucket: this.getBucketName(),
        Key: storedPath,
      }),
      { expiresIn: this.signedUrlTtlSeconds },
    );
  }

  private buildObjectKey(
    file: Express.Multer.File,
    context?: DocumentsStorageContext,
  ): string {
    const extension = extname(file.originalname).toLowerCase();
    const baseName = this.sanitizeName(
      file.originalname.replace(extension, ''),
    );
    const finalName = `${Date.now()}-${randomUUID()}-${baseName}${extension}`;

    if (context?.situationId) {
      return `situations/${context.situationId}/${finalName}`;
    }

    if (context?.apprenantId && context.documentType === 'CV') {
      return `apprenants/${context.apprenantId}/cv/${finalName}`;
    }

    if (context?.apprenantId) {
      return `apprenants/${context.apprenantId}/${finalName}`;
    }

    return `documents/${finalName}`;
  }

  private sanitizeName(name: string): string {
    return name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 80);
  }

  private getClient(): S3Client {
    if (!this.client) {
      throw new InternalServerErrorException(
        'Configuration Backblaze B2 incomplète',
      );
    }
    return this.client;
  }

  private getBucketName(): string {
    if (!this.bucketName) {
      throw new InternalServerErrorException(
        'Nom du bucket Backblaze B2 manquant',
      );
    }
    return this.bucketName;
  }
}
