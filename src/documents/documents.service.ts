import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DOCTYPE, Prisma, ROLE } from '@prisma/client';
import {
  buildPaginationMeta,
  normalizePagination,
} from 'src/common/helpers/pagination.helper';
import {
  APPRENANTS_ERRORS,
  DOCUMENTS_ERRORS,
} from 'src/common/constants/error-messages.constant';
import { PrismaService } from 'src/prisma/prisma.service';
import { LocalDocumentsStorageService } from './storage/local-documents-storage.service';
import { DocumentsQueryDto } from './dto/documents-query.dto';
import { CreateDocumentDto } from './dto/create-document.dto';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: LocalDocumentsStorageService,
  ) {}

  private readonly documentListSelect = {
    id: true,
    type: true,
    fichier: true,
    dateUpload: true,
    createdAt: true,
    updatedAt: true,
    apprenantId: true,
    situationId: true,
  } as const;

  /**
   * Liste les documents d'un apprenant avec pagination et filtres.
   * L'accès est contrôlé: staff autorisé, apprenant uniquement sur son propre profil.
   */
  async findByApprenant(
    apprenantId: string,
    query: DocumentsQueryDto,
    requesterUserId: string,
    requesterRole: ROLE,
  ) {
    await this.ensureReadAccess(apprenantId, requesterUserId, requesterRole);

    const { page, limit, skip } = normalizePagination(query);
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';

    const where: Prisma.DocumentWhereInput = {
      apprenantId,
      ...(query.type ? { type: query.type } : {}),
      ...(query.search
        ? { fichier: { contains: query.search, mode: 'insensitive' } }
        : {}),
    };

    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.document.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
      }),
      this.prisma.document.count({ where }),
    ]);

    return {
      items,
      pagination: buildPaginationMeta(page, limit, totalItems),
    };
  }

  /**
   * Retourne le détail d'un document avec contrôle d'accès.
   */
  async findOne(id: string, requesterUserId: string, requesterRole: ROLE) {
    const document = await this.ensureDocumentExists(id);
    await this.ensureReadAccess(
      document.apprenantId,
      requesterUserId,
      requesterRole,
    );

    return document;
  }

  /**
   * Crée un document pour l'apprenant connecté et le rattache à une situation.
   * Règle métier: l'apprenant ne peut uploader que sur ses propres situations.
   */
  async uploadForMe(
    requesterUserId: string,
    file: Express.Multer.File,
    dto: CreateDocumentDto,
  ) {
    const apprenant = await this.getApprenantByUserId(requesterUserId);
    this.validateFile(file);
    if (dto.type === DOCTYPE.CV) {
      throw new BadRequestException(
        'Utilisez /apprenants/me/cv pour ajouter ou remplacer le CV',
      );
    }
    if (!dto.situationId) {
      throw new BadRequestException(
        'situationId est obligatoire pour ce type de document',
      );
    }

    const situation = await this.prisma.situationProfessionnelle.findUnique({
      where: { id: dto.situationId },
      select: { id: true, apprenantId: true },
    });

    if (!situation) {
      throw new NotFoundException('Situation introuvable');
    }

    if (situation.apprenantId !== apprenant.id) {
      throw new ForbiddenException(
        'Vous ne pouvez pas ajouter un document sur cette situation',
      );
    }

    const storedPath = await this.storage.save(file);

    return this.prisma.document.create({
      data: {
        apprenantId: apprenant.id,
        situationId: situation.id,
        type: dto.type,
        fichier: storedPath,
      },
    });
  }

  /**
   * Ajoute ou remplace le CV global de l'apprenant connecte.
   * Le document CV est volontairement independant des situations.
   */
  async uploadCvForMe(requesterUserId: string, file: Express.Multer.File) {
    const apprenant = await this.getApprenantByUserId(requesterUserId);
    this.validateCvFile(file);
    let storedPath: string | undefined;
    let replacedPath: string | undefined;

    try {
      storedPath = await this.storage.save(file);
      const existingCv = await this.getLatestCv(apprenant.id);

      if (existingCv) {
        replacedPath = existingCv.fichier;
        const updated = await this.prisma.document.update({
          where: { id: existingCv.id },
          data: {
            fichier: storedPath,
            dateUpload: new Date(),
            type: DOCTYPE.CV,
            situationId: null,
          },
          select: this.documentListSelect,
        });

        // Une fois la référence DB mise à jour, on libère l'ancien fichier local.
        if (replacedPath && replacedPath !== storedPath) {
          await this.storage.remove(replacedPath).catch((error: unknown) => {
            this.logger.warn(
              `Impossible de supprimer l'ancien CV (${replacedPath}): ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          });
        }

        return updated;
      }

      return this.prisma.document.create({
        data: {
          apprenantId: apprenant.id,
          type: DOCTYPE.CV,
          fichier: storedPath,
          situationId: null,
        },
        select: this.documentListSelect,
      });
    } catch (error) {
      // Si l'écriture DB échoue, on nettoie le nouveau fichier pour éviter
      // d'accumuler des fichiers orphelins sur le disque.
      if (storedPath) {
        await this.storage.remove(storedPath).catch((cleanupError: unknown) => {
          this.logger.warn(
            `Cleanup fichier CV échoué (${storedPath}): ${
              cleanupError instanceof Error
                ? cleanupError.message
                : String(cleanupError)
            }`,
          );
        });
      }
      this.handleUploadPersistenceError(error);
    }
  }

  /**
   * Retourne le CV global d'un apprenant, si disponible.
   */
  async findCvByApprenant(
    apprenantId: string,
    requesterUserId: string,
    requesterRole: ROLE,
  ) {
    await this.ensureReadAccess(apprenantId, requesterUserId, requesterRole);
    return this.getLatestCv(apprenantId);
  }

  /**
   * Liste les documents d'une situation.
   * Accès: staff autorisé; apprenant autorisé uniquement sur ses propres situations.
   */
  async findBySituation(
    situationId: string,
    requesterUserId: string,
    requesterRole: ROLE,
  ) {
    const situation = await this.prisma.situationProfessionnelle.findUnique({
      where: { id: situationId },
      select: { id: true, apprenantId: true },
    });

    if (!situation) {
      throw new NotFoundException('Situation introuvable');
    }

    const staffRoles: ROLE[] = [ROLE.POLE_EMPLOI, ROLE.MANAGER, ROLE.COACH];

    if (staffRoles.includes(requesterRole)) {
      return this.prisma.document.findMany({
        where: { situationId },
        select: this.documentListSelect,
        orderBy: { createdAt: 'desc' },
      });
    }

    if (requesterRole === ROLE.APPRENANT) {
      const apprenant = await this.getApprenantByUserId(requesterUserId);
      if (apprenant.id !== situation.apprenantId) {
        throw new ForbiddenException(DOCUMENTS_ERRORS.FORBIDDEN.message);
      }

      return this.prisma.document.findMany({
        where: { situationId },
        select: this.documentListSelect,
        orderBy: { createdAt: 'desc' },
      });
    }

    throw new ForbiddenException(DOCUMENTS_ERRORS.FORBIDDEN.message);
  }

  /**
   * Supprime un document de l'apprenant connecté.
   * Un apprenant ne peut supprimer que ses propres documents.
   */
  async removeForMe(id: string, requesterUserId: string) {
    const apprenant = await this.getApprenantByUserId(requesterUserId);
    const document = await this.ensureDocumentExists(id);

    if (document.apprenantId !== apprenant.id) {
      throw new ForbiddenException(DOCUMENTS_ERRORS.FORBIDDEN.message);
    }

    await this.prisma.document.delete({ where: { id } });
    // On supprime aussi le binaire local pour éviter la saturation disque.
    await this.storage.remove(document.fichier).catch((error: unknown) => {
      this.logger.warn(
        `Impossible de supprimer le fichier ${document.fichier}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
    return { message: 'Document supprime avec succes' };
  }

  /**
   * Contrôle les droits de lecture:
   * - staff (POLE_EMPLOI, MANAGER, COACH) autorisé
   * - apprenant autorisé uniquement sur ses propres données
   */
  private async ensureReadAccess(
    apprenantId: string,
    requesterUserId: string,
    requesterRole: ROLE,
  ): Promise<void> {
    const staffRoles: ROLE[] = [ROLE.POLE_EMPLOI, ROLE.MANAGER, ROLE.COACH];
    if (staffRoles.includes(requesterRole)) {
      await this.ensureApprenantExists(apprenantId);
      return;
    }

    if (requesterRole === ROLE.APPRENANT) {
      const me = await this.getApprenantByUserId(requesterUserId);
      if (me.id !== apprenantId) {
        throw new ForbiddenException(DOCUMENTS_ERRORS.FORBIDDEN.message);
      }
      return;
    }

    throw new ForbiddenException(DOCUMENTS_ERRORS.FORBIDDEN.message);
  }

  /**
   * Vérifie l'existence d'un apprenant.
   */
  private async ensureApprenantExists(apprenantId: string): Promise<void> {
    const apprenant = await this.prisma.apprenant.findUnique({
      where: { id: apprenantId },
      select: { id: true },
    });
    if (!apprenant) {
      throw new NotFoundException(APPRENANTS_ERRORS.NOT_FOUND.message);
    }
  }

  /**
   * Récupère un apprenant à partir de l'utilisateur connecté.
   */
  private async getApprenantByUserId(userId: string) {
    const apprenant = await this.prisma.apprenant.findUnique({
      where: { userId },
      select: { id: true, userId: true },
    });
    if (!apprenant) {
      throw new NotFoundException(APPRENANTS_ERRORS.NOT_FOUND.message);
    }
    return apprenant;
  }

  /**
   * Vérifie qu'un document existe.
   */
  private async ensureDocumentExists(id: string) {
    // Pour les controles d'acces, on ne lit que l'identite du document
    // et son rattachement a l'apprenant. Le detail complet n'est pas utile ici.
    const document = await this.prisma.document.findUnique({
      where: { id },
      select: this.documentListSelect,
    });

    if (!document) {
      throw new NotFoundException(DOCUMENTS_ERRORS.NOT_FOUND.message);
    }
    return document;
  }

  /**
   * Lit le CV global le plus recent d'un apprenant.
   * On filtre par situationId=null pour separer le CV des documents de situation.
   */
  private async getLatestCv(apprenantId: string) {
    return this.prisma.document.findFirst({
      where: {
        apprenantId,
        type: DOCTYPE.CV,
        situationId: null,
      },
      select: this.documentListSelect,
      orderBy: { updatedAt: 'desc' },
    });
  }

  /**
   * Valide le fichier uploadé:
   * - présence obligatoire
   * - taille maximale 10 Mo
   * - extensions autorisées
   */
  private validateFile(file?: Express.Multer.File): void {
    if (!file) {
      throw new BadRequestException(DOCUMENTS_ERRORS.FILE_REQUIRED.message);
    }

    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new BadRequestException(DOCUMENTS_ERRORS.FILE_TOO_LARGE.message);
    }

    const allowed = new Set([
      '.pdf',
      '.png',
      '.jpg',
      '.jpeg',
      '.doc',
      '.docx',
      '.xls',
      '.xlsx',
    ]);

    const fileName = file.originalname.toLowerCase();
    const extension = fileName.slice(fileName.lastIndexOf('.'));
    if (!allowed.has(extension)) {
      throw new BadRequestException(DOCUMENTS_ERRORS.INVALID_FILE_TYPE.message);
    }
  }

  /**
   * Validation spécifique au CV:
   * on impose un PDF uniquement pour homogénéiser la lecture côté staff.
   */
  private validateCvFile(file?: Express.Multer.File): void {
    if (!file) {
      throw new BadRequestException(DOCUMENTS_ERRORS.FILE_REQUIRED.message);
    }

    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new BadRequestException(DOCUMENTS_ERRORS.FILE_TOO_LARGE.message);
    }

    const fileName = file.originalname.toLowerCase();
    if (!fileName.endsWith('.pdf')) {
      throw new BadRequestException('Le CV doit être au format PDF');
    }
  }

  /**
   * Convertit les erreurs techniques d'upload (Prisma/stockage)
   * en réponses API explicites pour éviter les 500 opaques côté frontend.
   */
  private handleUploadPersistenceError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2011') {
        throw new BadRequestException(
          'Contrainte base invalide sur Document. Vérifiez la migration Prisma de situationId nullable.',
        );
      }
      if (error.code === 'P2003') {
        throw new BadRequestException(
          'Relation invalide pour le document (clé étrangère).',
        );
      }
      if (error.code === 'P1001' || error.code === 'P1017') {
        throw new ServiceUnavailableException(
          'Base de données temporairement indisponible',
        );
      }
    }

    if (error instanceof Prisma.PrismaClientInitializationError) {
      throw new ServiceUnavailableException(
        'Base de données temporairement indisponible',
      );
    }

    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      if (
        msg.includes('eacces') ||
        msg.includes('enoent') ||
        msg.includes('enospc')
      ) {
        throw new InternalServerErrorException(
          'Stockage local indisponible pour enregistrer le fichier',
        );
      }
      this.logger.error(
        `Erreur upload document: ${error.message}`,
        error.stack,
      );
    }

    throw new InternalServerErrorException(
      'Erreur inattendue lors de l’upload du document',
    );
  }
}
