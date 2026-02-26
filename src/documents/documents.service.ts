import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ROLE } from '@prisma/client';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: LocalDocumentsStorageService,
  ) {}

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
   * Crée un document pour l'apprenant connecté:
   * - récupère l'apprenant via userId
   * - stocke le fichier en local
   * - persiste les métadonnées en base
   */
  async uploadForMe(
    requesterUserId: string,
    file: Express.Multer.File,
    dto: CreateDocumentDto,
  ) {
    const apprenant = await this.getApprenantByUserId(requesterUserId);
    this.validateFile(file);

    const storedPath = await this.storage.save(file);

    return this.prisma.document.create({
      data: {
        apprenantId: apprenant.id,
        type: dto.type,
        fichier: storedPath,
      },
    });
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
    const document = await this.prisma.document.findUnique({
      where: { id },
      include: {
        apprenant: {
          include: {
            user: {
              select: {
                id: true,
                nom: true,
                prenom: true,
                email: true,
                role: true,
                actif: true,
              },
            },
          },
        },
      },
    });

    if (!document) {
      throw new NotFoundException(DOCUMENTS_ERRORS.NOT_FOUND.message);
    }
    return document;
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
}
