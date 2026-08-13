import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DOCTYPE, Prisma, ROLE } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { Workbook } from 'exceljs';
import { randomBytes } from 'node:crypto';
import { EmailService } from 'src/email/email.service';
import { InOdcClientService } from 'src/integrations/in-odc/in-odc-client.service';
import { MasterDataSyncService } from 'src/master-data/master-data-sync.service';
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
    private readonly inOdcClientService: InOdcClientService,
    private readonly masterDataSyncService: MasterDataSyncService,
    private readonly emailService: EmailService,
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

    const [items, totalItems, totalWithSituations] =
      await this.prisma.$transaction([
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
        this.prisma.apprenant.count({
          where: {
            ...where,
            situations: {
              some: {},
            },
          },
        }),
      ]);

    return {
      items,
      pagination: buildPaginationMeta(page, limit, totalItems),
      summary: {
        totalWithSituations,
      },
    };
  }

  async findAllFromInOdc(query: ApprenantsQueryDto) {
    if (await this.isHistoricalPromotionSelection(query.promotionId)) {
      return this.findAllHistorical(query);
    }

    const { page, limit } = normalizePagination(query);
    const allMasterLearners = await this.masterDataSyncService.getReferenceLearners(
      { forceRefresh: query.forceRefresh ?? true },
    );
    const filteredLearners = allMasterLearners.filter((item) => {
      if (
        query.promotionId &&
        item.promotion.id !== query.promotionId
      ) {
        return false;
      }

      if (query.referentielId && item.referential?.id !== query.referentielId) {
        return false;
      }

      if (query.search) {
        const search = query.search.trim().toLowerCase();
        const haystack = [
          item.firstName,
          item.lastName,
          item.user.email,
          item.phone,
          item.matricule,
          item.promotion.name,
          item.referential?.name ?? '',
        ]
          .join(' ')
          .toLowerCase();

        if (!haystack.includes(search)) {
          return false;
        }
      }

      return true;
    });
    const situationsByIdentity =
      await this.buildMasterLearnerSituationSummary(filteredLearners);
    const pagedLearners = filteredLearners.slice(
      (page - 1) * limit,
      (page - 1) * limit + limit,
    );
    const response = {
      items: pagedLearners,
      pagination: buildPaginationMeta(page, limit, filteredLearners.length),
    };

    return {
      items: response.items.map((item) => ({
        ...this.mapSituationSummaryForMasterLearner(item, situationsByIdentity),
        id: item.id,
        inOdcId: item.id,
        telephone: item.phone,
        statutApprenant: item.status,
        user: {
          id: item.id,
          nom: item.lastName,
          prenom: item.firstName,
          email: item.user.email,
          role: ROLE.APPRENANT,
          actif: true,
        },
        promotion: {
          id: item.promotion.id,
          nom: item.promotion.name,
          estActive: item.promotion.status === 'ACTIVE',
        },
        referentiel: item.referential
          ? {
              id: item.referential.id,
              nom: item.referential.name,
            }
          : {
              id: '',
              nom: 'Non assigne',
            },
        session: item.session
          ? {
              id: item.session.id,
              nom: item.session.name,
            }
          : null,
      })),
      pagination: response.pagination,
      summary: {
        totalWithSituations: Array.from(situationsByIdentity.values()).filter(
          (count) => count > 0,
        ).length,
      },
    };
  }

  private async findAllHistorical(query: ApprenantsQueryDto) {
    const { page, limit, skip } = normalizePagination(query);
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';
    const where = await this.buildHistoricalApprenantsWhere(query);

    const [items, totalItems, totalWithSituations] =
      await this.prisma.$transaction([
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
        this.prisma.apprenant.count({
          where: {
            ...where,
            situations: {
              some: {},
            },
          },
        }),
      ]);

    return {
      items,
      pagination: buildPaginationMeta(page, limit, totalItems),
      summary: {
        totalWithSituations,
      },
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

  async findOneFromInOdc(id: string) {
    try {
      const learner = await this.inOdcClientService.getLearnerById(id);
      const localApprenant = await this.findLocalApprenantForMasterData(
        learner.user.email,
        learner.phone,
      );

      const cvDocument = localApprenant
        ? await this.prisma.document.findFirst({
            where: {
              apprenantId: localApprenant.id,
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
          })
        : null;

      return {
        id: learner.id,
        localId: localApprenant?.id ?? null,
        telephone: learner.phone,
        user: {
          id: learner.user.id,
          nom: learner.lastName,
          prenom: learner.firstName,
          email: learner.user.email,
        },
        promotion: {
          id: learner.promotion.id,
          nom: learner.promotion.name,
        },
        referentiel: learner.referential
          ? {
              id: learner.referential.id,
              nom: learner.referential.name,
            }
          : {
              id: '',
              nom: 'Non assigne',
            },
        situations: localApprenant?.situations ?? [],
        cvDocument: cvDocument
          ? await this.resolveDocumentSummary(cvDocument)
          : null,
      };
    } catch (error) {
      if (!(error instanceof NotFoundException)) {
        throw error;
      }

      const localApprenant = await this.findOne(id);

      return {
        ...localApprenant,
        localId: localApprenant.id,
      };
    }
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

  async resendHistoricalCredentials(id: string) {
    const apprenant = await this.prisma.apprenant.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            nom: true,
            prenom: true,
            email: true,
          },
        },
        promotion: {
          select: {
            id: true,
            nom: true,
          },
        },
      },
    });

    if (!apprenant) {
      throw new NotFoundException(APPRENANTS_ERRORS.NOT_FOUND.message);
    }

    const inOdcPromotions = await this.masterDataSyncService.getPromotions({
      forceRefresh: true,
    });
    const isHistoricalPromotion = !inOdcPromotions.some(
      (promotion) =>
        this.normalizeText(promotion.name) ===
        this.normalizeText(apprenant.promotion.nom),
    );

    if (!isHistoricalPromotion) {
      throw new BadRequestException(
        'Le renvoi des identifiants est reserve aux apprenants historiques importes.',
      );
    }

    const temporaryPassword = this.generateTemporaryPassword();
    const hashedPassword = await bcrypt.hash(temporaryPassword, 10);

    await this.emailService.sendHistoricalLearnerCredentials({
      email: apprenant.user.email,
      firstName: apprenant.user.prenom,
      lastName: apprenant.user.nom,
      temporaryPassword,
    });

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: apprenant.user.id },
        data: {
          motDePasse: hashedPassword,
        },
      }),
      this.prisma.apprenant.update({
        where: { id: apprenant.id },
        data: {
          motDePasseTemporaire: true,
        },
      }),
    ]);

    return {
      apprenantId: apprenant.id,
      email: apprenant.user.email,
      promotion: apprenant.promotion.nom,
      message: 'Identifiants renvoyes avec succes',
    };
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

  private async findLocalApprenantForMasterData(email: string, phone?: string) {
    const orConditions: Prisma.ApprenantWhereInput[] = [{ user: { email } }];

    if (phone) {
      orConditions.push({ telephone: phone });
    }

    return this.prisma.apprenant.findFirst({
      where: {
        OR: orConditions,
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
  }

  private generateTemporaryPassword() {
    const alphabet =
      'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    const bytes = randomBytes(10);

    return Array.from(bytes)
      .map((value) => alphabet[value % alphabet.length])
      .join('');
  }

  private normalizeText(value: string) {
    return value.trim().toLowerCase();
  }

  private async buildMasterLearnerSituationSummary(
    learners: Array<{
      user: { email: string };
      phone?: string | null;
    }>,
  ) {
    const normalizedEmails = Array.from(
      new Set(
        learners
          .map((learner) => learner.user.email?.trim().toLowerCase())
          .filter((value): value is string => Boolean(value)),
      ),
    );
    const normalizedPhones = Array.from(
      new Set(
        learners
          .map((learner) => learner.phone?.trim())
          .filter((value): value is string => Boolean(value)),
      ),
    );

    const orConditions: Prisma.ApprenantWhereInput[] = [];

    if (normalizedEmails.length > 0) {
      orConditions.push({
        user: {
          email: {
            in: normalizedEmails,
          },
        },
      });
    }

    if (normalizedPhones.length > 0) {
      orConditions.push({
        telephone: {
          in: normalizedPhones,
        },
      });
    }

    if (orConditions.length === 0) {
      return new Map<string, number>();
    }

    const localApprenants = await this.prisma.apprenant.findMany({
      where: {
        OR: orConditions,
      },
      select: {
        telephone: true,
        user: {
          select: {
            email: true,
          },
        },
        _count: {
          select: {
            situations: true,
          },
        },
        situations: {
          select: {
            valide: true,
          },
          take: 1,
        },
      },
    });

    const result = new Map<string, number>();

    for (const apprenant of localApprenants) {
      const count = apprenant._count.situations;
      const normalizedEmail = apprenant.user.email.trim().toLowerCase();
      result.set(`email:${normalizedEmail}`, count);

      if (apprenant.telephone?.trim()) {
        result.set(`phone:${apprenant.telephone.trim()}`, count);
      }
    }

    return result;
  }

  private mapSituationSummaryForMasterLearner(
    learner: {
      user: { email: string };
      phone?: string | null;
    },
    situationsByIdentity: Map<string, number>,
  ) {
    const normalizedEmail = learner.user.email?.trim().toLowerCase();
    const normalizedPhone = learner.phone?.trim();
    const situationsCount =
      (normalizedEmail
        ? situationsByIdentity.get(`email:${normalizedEmail}`)
        : undefined) ??
      (normalizedPhone
        ? situationsByIdentity.get(`phone:${normalizedPhone}`)
        : undefined) ??
      0;

    return {
      _count: {
        situations: situationsCount,
      },
      situations:
        situationsCount > 0
          ? [
              {
                valide: true,
              },
            ]
          : [],
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

  private async buildHistoricalApprenantsWhere(
    query: ApprenantsQueryDto,
  ): Promise<Prisma.ApprenantWhereInput> {
    let referentielIds: string[] | undefined;

    if (query.referentielId) {
      const masterReferentials =
        await this.masterDataSyncService.getReferentials({
          forceRefresh: true,
        });
      const selectedMasterReferential = masterReferentials.find(
        (item) => item.id === query.referentielId,
      );

      if (selectedMasterReferential) {
        const localReferentials = await this.prisma.referentiel.findMany({
          where: {
            nom: {
              equals: selectedMasterReferential.name,
              mode: 'insensitive',
            },
          },
          select: { id: true },
        });

        referentielIds = localReferentials.map((item) => item.id);
      } else {
        referentielIds = [query.referentielId];
      }
    }

    return {
      ...(query.genre ? { genre: query.genre } : {}),
      ...(referentielIds
        ? {
            referentielId:
              referentielIds.length === 1
                ? referentielIds[0]
                : { in: referentielIds },
          }
        : {}),
      ...(query.promotionId ? { promotionId: query.promotionId } : {}),
      ...(query.search
        ? {
            OR: [
              {
                user: {
                  nom: { contains: query.search, mode: 'insensitive' },
                },
              },
              {
                user: {
                  prenom: { contains: query.search, mode: 'insensitive' },
                },
              },
              {
                user: {
                  email: { contains: query.search, mode: 'insensitive' },
                },
              },
              { telephone: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  private async isHistoricalPromotionSelection(promotionId?: string) {
    if (!promotionId) {
      return false;
    }

    const [localPromotion, masterPromotions] = await Promise.all([
      this.prisma.promotion.findUnique({
        where: { id: promotionId },
        select: { id: true },
      }),
      this.masterDataSyncService.getPromotions({ forceRefresh: true }),
    ]);

    if (!localPromotion) {
      return false;
    }

    return !masterPromotions.some((promotion) => promotion.id === promotionId);
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
