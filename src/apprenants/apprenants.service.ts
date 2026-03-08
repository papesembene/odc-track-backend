import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DOCTYPE, Prisma, ROLE } from '@prisma/client';
import { Workbook } from 'exceljs';
import { PrismaService } from 'src/prisma/prisma.service';
import { ApprenantsQueryDto } from './dto/apprenants-query.dto';
import { CreateApprenantDto } from './dto/create-apprenant.dto';
import { UpdateApprenantDto } from './dto/update-apprenant.dto';
import {
  APPRENANTS_ERRORS,
  PROMOTIONS_ERRORS,
  REFERENTIELS_ERRORS,
  USER_ERRORS,
} from 'src/common/constants/error-messages.constant';
import {
  buildPaginationMeta,
  normalizePagination,
} from 'src/common/helpers/pagination.helper';
import { DOCUMENTS_STORAGE } from 'src/common/storage/documents-storage.interface';
import type { DocumentsStorageService } from 'src/common/storage/documents-storage.interface';

@Injectable()
export class ApprenantsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(DOCUMENTS_STORAGE)
    private readonly documentsStorage: DocumentsStorageService,
  ) {}

  async create(dto: CreateApprenantDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
    });
    if (!user) throw new NotFoundException(USER_ERRORS.NOT_FOUND.message);
    if (user.role !== ROLE.APPRENANT) {
      throw new BadRequestException('Le user doit avoir le role APPRENANT');
    }

    const referentiel = await this.prisma.referentiel.findUnique({
      where: { id: dto.referentielId },
    });
    if (!referentiel)
      throw new NotFoundException(REFERENTIELS_ERRORS.NOT_FOUND.message);

    const promotion = await this.prisma.promotion.findUnique({
      where: { id: dto.promotionId },
    });
    if (!promotion)
      throw new NotFoundException(PROMOTIONS_ERRORS.NOT_FOUND.message);

    const promotionReferentiel =
      await this.prisma.promotionReferentiel.findUnique({
        where: {
          promotionId_referentielId: {
            promotionId: dto.promotionId,
            referentielId: dto.referentielId,
          },
        },
      });
    if (!promotionReferentiel) {
      throw new BadRequestException(
        'Le referentiel ne fait pas partie de la promotion',
      );
    }

    return this.prisma.apprenant.create({
      data: {
        userId: dto.userId,
        referentielId: dto.referentielId,
        promotionId: dto.promotionId,
        telephone: dto.telephone,
        dateNaissance: dto.dateNaissance
          ? new Date(dto.dateNaissance)
          : undefined,
        genre: dto.genre,
        adresse: dto.adresse,
      },
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
        referentiel: true,
        promotion: true,
      },
    });
  }

  async findAll(query: ApprenantsQueryDto) {
    const { page, limit, skip } = normalizePagination(query);
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';

    const where = this.buildApprenantsWhere(query);

    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.apprenant.findMany({
        where,
        skip,
        take: limit,
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
          referentiel: true,
          promotion: true,
          _count: {
            select: {
              situations: true,
            },
          },
          situations: {
            where: {
              valide: true,
            },
            select: {
              valide: true,
            },
            take: 1,
          },
        },
        orderBy: { [sortBy]: sortOrder },
      }),
      this.prisma.apprenant.count({ where }),
    ]);

    return {
      items,
      pagination: buildPaginationMeta(page, limit, totalItems),
    };
  }

  /**
   * Génère un export XLSX des apprenants visibles dans le périmètre courant.
   * On n'affiche Odc@1234 que pour les comptes encore marqués comme temporaires.
   */
  async exportXlsx(query: ApprenantsQueryDto) {
    const where = this.buildApprenantsWhere(query);

    const apprenants = await this.prisma.apprenant.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        telephone: true,
        motDePasseTemporaire: true,
        user: {
          select: {
            nom: true,
            prenom: true,
            email: true,
            actif: true,
          },
        },
        promotion: {
          select: {
            nom: true,
            annee: true,
          },
        },
        referentiel: {
          select: {
            nom: true,
          },
        },
      },
    });

    const workbook = new Workbook();
    const worksheet = workbook.addWorksheet('Apprenants');

    worksheet.columns = [
      { header: 'Nom', key: 'nom', width: 22 },
      { header: 'Prénom', key: 'prenom', width: 22 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Référentiel', key: 'referentiel', width: 24 },
      { header: 'Mot de passe par défaut', key: 'motDePasse', width: 28 },
    ];

    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF3F4F6' },
    };

    apprenants.forEach((apprenant) => {
      worksheet.addRow({
        nom: apprenant.user.nom,
        prenom: apprenant.user.prenom,
        email: apprenant.user.email,
        referentiel: apprenant.referentiel.nom,
        // Le metier demande ici d'exporter systematiquement le mot de passe
        // temporaire par defaut communique aux apprenants.
        motDePasse: 'Odc@1234',
      });
    });

    const fileName = `apprenants-${new Date().toISOString().slice(0, 10)}.xlsx`;
    const buffer = await workbook.xlsx.writeBuffer();

    return {
      fileName,
      buffer,
    };
  }

  async findOne(id: string) {
    const apprenant = await this.prisma.apprenant.findUnique({
      where: { id },
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
        referentiel: true,
        promotion: true,
        situations: {
          select: {
            id: true,
            statut: true,
            dateDebut: true,
            dateFin: true,
            commentaire: true,
            valide: true,
            createdAt: true,
            nomEntrepriseLibre: true,
            entreprise: {
              select: {
                id: true,
                nom: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!apprenant)
      throw new NotFoundException(APPRENANTS_ERRORS.NOT_FOUND.message);

    // Le CV est un document global de l'apprenant (hors situation).
    const cvDocument = await this.prisma.document.findFirst({
      where: {
        apprenantId: apprenant.id,
        type: DOCTYPE.CV,
        situationId: null,
      },
      select: {
        id: true,
        type: true,
        fichier: true,
        dateUpload: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    return {
      ...apprenant,
      cvDocument: cvDocument
        ? await this.resolveDocumentSummary(cvDocument)
        : cvDocument,
    };
  }

  async update(id: string, dto: UpdateApprenantDto) {
    const existingApprenant = await this.findOne(id);

    if (dto.promotionId && dto.promotionId !== existingApprenant.promotionId) {
      throw new BadRequestException(
        'Changement de promotion non autorise apres creation',
      );
    }

    if (dto.userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: dto.userId },
      });
      if (!user) throw new NotFoundException(USER_ERRORS.NOT_FOUND.message);
      if (user.role !== ROLE.APPRENANT) {
        throw new BadRequestException('Le user doit avoir le role APPRENANT');
      }
    }

    if (dto.referentielId) {
      const referentiel = await this.prisma.referentiel.findUnique({
        where: { id: dto.referentielId },
      });
      if (!referentiel)
        throw new NotFoundException(REFERENTIELS_ERRORS.NOT_FOUND.message);

      const promotionReferentiel =
        await this.prisma.promotionReferentiel.findUnique({
          where: {
            promotionId_referentielId: {
              promotionId: existingApprenant.promotionId,
              referentielId: dto.referentielId,
            },
          },
        });
      if (!promotionReferentiel) {
        throw new BadRequestException(
          'Le referentiel ne fait pas partie de la promotion de l apprenant',
        );
      }
    }

    return this.prisma.apprenant.update({
      where: { id },
      data: {
        ...dto,
        dateNaissance: dto.dateNaissance
          ? new Date(dto.dateNaissance)
          : undefined,
      },
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
        referentiel: true,
        promotion: true,
      },
    });
  }

  async remove(id: string) {
    const apprenant = await this.findOne(id);

    await this.prisma.user.update({
      where: { id: apprenant.userId },
      data: { actif: false },
    });

    return { message: 'Compte apprenant desactive avec succes' };
  }

  async getMe(userId: string) {
    const apprenant = await this.prisma.apprenant.findUnique({
      where: { userId },
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
        referentiel: true,
        promotion: true,
      },
    });

    if (!apprenant)
      throw new NotFoundException(APPRENANTS_ERRORS.NOT_FOUND.message);

    // Expose egalement le CV global sur le profil "me".
    const cvDocument = await this.prisma.document.findFirst({
      where: {
        apprenantId: apprenant.id,
        type: DOCTYPE.CV,
        situationId: null,
      },
      select: {
        id: true,
        type: true,
        fichier: true,
        dateUpload: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    return {
      ...apprenant,
      cvDocument: cvDocument
        ? await this.resolveDocumentSummary(cvDocument)
        : cvDocument,
    };
  }

  private async resolveDocumentSummary<T extends { fichier: string }>(
    document: T,
  ): Promise<T> {
    return {
      ...document,
      fichier: await this.documentsStorage.resolveAccessPath(document.fichier),
    };
  }

  private buildApprenantsWhere(
    query: ApprenantsQueryDto,
  ): Prisma.ApprenantWhereInput {
    return {
      ...(query.referentielId ? { referentielId: query.referentielId } : {}),
      ...(query.promotionId ? { promotionId: query.promotionId } : {}),
      ...(query.genre
        ? { genre: { equals: query.genre, mode: 'insensitive' } }
        : {}),
      ...(typeof query.actif === 'boolean'
        ? {
            user: {
              is: {
                actif: query.actif,
              },
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              {
                user: {
                  is: { nom: { contains: query.search, mode: 'insensitive' } },
                },
              },
              {
                user: {
                  is: {
                    prenom: { contains: query.search, mode: 'insensitive' },
                  },
                },
              },
              {
                user: {
                  is: {
                    email: { contains: query.search, mode: 'insensitive' },
                  },
                },
              },
              { adresse: { contains: query.search, mode: 'insensitive' } },
              { telephone: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  async updateMe(userId: string, dto: UpdateApprenantDto) {
    const apprenant = await this.prisma.apprenant.findUnique({
      where: { userId },
    });
    if (!apprenant)
      throw new NotFoundException(APPRENANTS_ERRORS.NOT_FOUND.message);

    return this.prisma.apprenant.update({
      where: { id: apprenant.id },
      data: {
        telephone: dto.telephone,
        dateNaissance: dto.dateNaissance
          ? new Date(dto.dateNaissance)
          : undefined,
        genre: dto.genre,
        adresse: dto.adresse,
      },
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
        referentiel: true,
        promotion: true,
      },
    });
  }
}
