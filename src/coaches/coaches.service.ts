import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DOCTYPE, Prisma, STATUT } from '@prisma/client';
import { MasterDataSyncService } from 'src/master-data/master-data-sync.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateCoachDto } from './dto/create-coach.dto';
import { CoachesQueryDto } from './dto/coaches-query.dto';
import { CoachApprenantsQueryDto } from './dto/coach-apprenants-query.dto';
import { CoachScopeQueryDto } from './dto/coach-scope-query.dto';
import {
  buildPaginationMeta,
  normalizePagination,
} from 'src/common/helpers/pagination.helper';
import { DOCUMENTS_STORAGE } from 'src/common/storage/documents-storage.interface';
import type { DocumentsStorageService } from 'src/common/storage/documents-storage.interface';

@Injectable()
export class CoachesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly masterDataSyncService: MasterDataSyncService,
    @Inject(DOCUMENTS_STORAGE)
    private readonly documentsStorage: DocumentsStorageService,
  ) {}

  private readonly coachScopedApprenantSelect = {
    id: true,
    telephone: true,
    createdAt: true,
    user: {
      select: {
        id: true,
        nom: true,
        prenom: true,
        email: true,
        actif: true,
      },
    },
    referentiel: {
      select: {
        id: true,
        nom: true,
      },
    },
    promotion: {
      select: {
        id: true,
        nom: true,
        annee: true,
      },
    },
    _count: {
      select: {
        situations: true,
      },
    },
    situations: {
      select: {
        id: true,
        statut: true,
        valide: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 3,
    },
  } as const;

  private readonly coachListSelect = {
    id: true,
    nom: true,
    prenom: true,
    email: true,
    role: true,
    actif: true,
    createdAt: true,
    updatedAt: true,
    coach: {
      select: {
        specialite: true,
        referentiel: {
          select: {
            id: true,
            nom: true,
          },
        },
      },
    },
  } as const;

  private async resolveCoachScope(userId: string, promotionId?: string) {
    // Point central du perimetre coach:
    // 1. on recupere son referentiel
    // 2. on determine la promotion consultee (active par defaut)
    // 3. on limite toujours les lectures a ce couple referentiel/promotion.
    const coachUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        coach: {
          select: {
            referentielId: true,
            referentiel: {
              select: {
                id: true,
                nom: true,
              },
            },
          },
        },
      },
    });

    if (!coachUser?.coach) {
      throw new ForbiddenException(
        'Le coach connecte n a pas de referentiel assigne',
      );
    }

    const availablePromotions = await this.prisma.promotion.findMany({
      where: {
        referentiels: {
          some: {
            referentielId: coachUser.coach.referentielId,
          },
        },
      },
      select: {
        id: true,
        nom: true,
        annee: true,
        estActive: true,
      },
      orderBy: [{ annee: 'desc' }, { nom: 'asc' }],
    });

    let selectedPromotion = null as {
      id: string;
      nom: string;
      annee: number;
      estActive: boolean;
    } | null;

    if (promotionId) {
      selectedPromotion =
        availablePromotions.find((promotion) => promotion.id === promotionId) ??
        null;

      if (!selectedPromotion) {
        throw new ForbiddenException(
          'Cette promotion n appartient pas au referentiel du coach',
        );
      }
    } else {
      selectedPromotion =
        availablePromotions.find((promotion) => promotion.estActive) ?? null;
    }

    return {
      referentiel: coachUser.coach.referentiel,
      referentielId: coachUser.coach.referentielId,
      selectedPromotion,
      availablePromotions,
    };
  }

  /**
   * Récupérer la liste de tous les coaches
   */
  async findAll(query: CoachesQueryDto) {
    const items = (await this.masterDataSyncService.getCoaches()).map((coach) => ({
      id: coach.id,
      nom: coach.lastName,
      prenom: coach.firstName,
      email: coach.user?.email ?? '',
      role: coach.user?.role ?? 'COACH',
      actif: true,
      createdAt: coach.createdAt ?? new Date(0).toISOString(),
      updatedAt: coach.updatedAt ?? null,
      referentiel: coach.referentials[0]
        ? {
            id: coach.referentials[0].id,
            nom: coach.referentials[0].name,
          }
        : null,
      specialite: coach.referentials[0]?.name ?? null,
      telephone: coach.phone ?? null,
      matricule: coach.matricule ?? null,
    }));

    const search = query.search?.trim().toLowerCase();
    const filteredItems = search
      ? items.filter((coach) =>
          [coach.nom, coach.prenom, coach.email, coach.referentiel?.nom ?? '']
            .join(' ')
            .toLowerCase()
            .includes(search),
        )
      : items;

    const { page, limit } = normalizePagination(query);
    const start = (page - 1) * limit;

    return {
      items: filteredItems.slice(start, start + limit),
      pagination: buildPaginationMeta(page, limit, filteredItems.length),
    };
  }

  async findAllLegacy(query: CoachesQueryDto) {
    const { page, limit, skip } = normalizePagination(query);
    const where: Prisma.UserWhereInput = {
      role: 'COACH',
      ...(query.search
        ? {
            OR: [
              { nom: { contains: query.search, mode: 'insensitive' } },
              { prenom: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    // On lit uniquement les champs affiches dans les listes manager.
    const [coaches, totalItems] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        select: this.coachListSelect,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    // Transformer pour avoir une structure plate
    const items = coaches.map((user) => ({
      id: user.id,
      nom: user.nom,
      prenom: user.prenom,
      email: user.email,
      role: user.role,
      actif: user.actif,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      referentiel: user.coach?.referentiel
        ? { id: user.coach.referentiel.id, nom: user.coach.referentiel.nom }
        : null,
      specialite: user.coach?.specialite || null,
    }));

    return {
      items,
      pagination: buildPaginationMeta(page, limit, totalItems),
    };
  }

  create(data: CreateCoachDto): never {
    void data;
    throw new ForbiddenException(
      'Les coaches sont geres dans in-odc. La creation locale est desactivee dans Suivi insertion.',
    );
  }

  async findMyApprenants(userId: string, query: CoachApprenantsQueryDto) {
    const { page, limit, skip } = normalizePagination(query);
    const scope = await this.resolveCoachScope(userId, query.promotionId);

    if (!scope.selectedPromotion) {
      return {
        items: [],
        pagination: buildPaginationMeta(page, limit, 0),
        scope,
      };
    }

    const where: Prisma.ApprenantWhereInput = {
      referentielId: scope.referentielId,
      promotionId: scope.selectedPromotion.id,
      ...(query.search
        ? {
            OR: [
              {
                user: {
                  is: {
                    nom: { contains: query.search, mode: 'insensitive' },
                  },
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
            ],
          }
        : {}),
    };

    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.apprenant.findMany({
        where,
        skip,
        take: limit,
        select: this.coachScopedApprenantSelect,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.apprenant.count({ where }),
    ]);

    return {
      items,
      pagination: buildPaginationMeta(page, limit, totalItems),
      scope,
    };
  }

  async findMyApprenantDetail(
    userId: string,
    apprenantId: string,
    query: CoachScopeQueryDto,
  ) {
    const scope = await this.resolveCoachScope(userId, query.promotionId);

    const apprenant = await this.prisma.apprenant.findFirst({
      where: {
        id: apprenantId,
        referentielId: scope.referentielId,
        ...(scope.selectedPromotion
          ? { promotionId: scope.selectedPromotion.id }
          : {}),
      },
      include: {
        user: {
          select: {
            id: true,
            nom: true,
            prenom: true,
            email: true,
            actif: true,
          },
        },
        referentiel: {
          select: {
            id: true,
            nom: true,
          },
        },
        promotion: {
          select: {
            id: true,
            nom: true,
            annee: true,
          },
        },
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
                secteur: true,
              },
            },
            // Le coach doit pouvoir consulter les pieces jointes reliees
            // aux situations de ses apprenants, sans endpoint supplementaire.
            documents: {
              select: {
                id: true,
                type: true,
                fichier: true,
                dateUpload: true,
                createdAt: true,
                situationId: true,
              },
              orderBy: { createdAt: 'desc' },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!apprenant) {
      throw new NotFoundException(
        'Apprenant introuvable dans le perimetre du coach',
      );
    }

    // Le coach peut consulter le CV global de l'apprenant en plus
    // des documents attaches aux situations.
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

    const situations = await Promise.all(
      apprenant.situations.map(async (situation) => ({
        ...situation,
        documents: await Promise.all(
          situation.documents.map((document) =>
            this.resolveDocumentSummary(document),
          ),
        ),
      })),
    );

    return {
      ...apprenant,
      situations,
      cvDocument: cvDocument
        ? await this.resolveDocumentSummary(cvDocument)
        : cvDocument,
      scope,
    };
  }

  async getMyDashboard(userId: string, query: CoachScopeQueryDto) {
    const scope = await this.resolveCoachScope(userId, query.promotionId);

    if (!scope.selectedPromotion) {
      return {
        scope,
        totalApprenants: 0,
        totalSituations: 0,
        validees: 0,
        enAttente: 0,
        tauxInsertion: 0,
        situationsRecentes: [],
      };
    }

    const apprenantWhere: Prisma.ApprenantWhereInput = {
      referentielId: scope.referentielId,
      promotionId: scope.selectedPromotion.id,
    };
    const situationsWhere: Prisma.SituationProfessionnelleWhereInput = {
      apprenant: apprenantWhere,
    };

    const [
      totalApprenants,
      totalSituations,
      validees,
      enAttente,
      emploisDistincts,
      situationsRecentes,
    ] = await Promise.all([
      this.prisma.apprenant.count({ where: apprenantWhere }),
      this.prisma.situationProfessionnelle.count({ where: situationsWhere }),
      this.prisma.situationProfessionnelle.count({
        where: { ...situationsWhere, valide: true },
      }),
      this.prisma.situationProfessionnelle.count({
        where: { ...situationsWhere, valide: false },
      }),
      this.prisma.situationProfessionnelle.findMany({
        where: {
          ...situationsWhere,
          statut: STATUT.EN_EMPLOI,
        },
        select: { apprenantId: true },
        distinct: ['apprenantId'],
      }),
      this.prisma.situationProfessionnelle.findMany({
        where: situationsWhere,
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          statut: true,
          createdAt: true,
          valide: true,
          apprenant: {
            select: {
              user: {
                select: {
                  nom: true,
                  prenom: true,
                },
              },
            },
          },
        },
      }),
    ]);

    return {
      scope,
      totalApprenants,
      totalSituations,
      validees,
      enAttente,
      tauxInsertion:
        totalApprenants === 0
          ? 0
          : Number(
              ((emploisDistincts.length / totalApprenants) * 100).toFixed(2),
            ),
      situationsRecentes,
    };
  }

  async getMyStatistiques(userId: string, query: CoachScopeQueryDto) {
    const scope = await this.resolveCoachScope(userId, query.promotionId);

    if (!scope.selectedPromotion) {
      return {
        scope,
        totalApprenants: 0,
        totalSituations: 0,
        enAttente: 0,
        validees: 0,
        tauxInsertion: 0,
        parStatut: {
          EN_EMPLOI: 0,
          EN_STAGE: 0,
          RECHERCHE_EMPLOI: 0,
          PROJET_PERSO: 0,
          POURSUITE_ETUDES: 0,
        },
      };
    }

    const grouped = await this.prisma.situationProfessionnelle.groupBy({
      by: ['statut'],
      _count: { _all: true },
      where: {
        apprenant: {
          referentielId: scope.referentielId,
          promotionId: scope.selectedPromotion.id,
        },
      },
    });

    const parStatut = {
      EN_EMPLOI: 0,
      EN_STAGE: 0,
      RECHERCHE_EMPLOI: 0,
      PROJET_PERSO: 0,
      POURSUITE_ETUDES: 0,
    };

    for (const row of grouped) {
      if (row.statut in parStatut) {
        parStatut[row.statut as keyof typeof parStatut] = row._count._all;
      }
    }

    const [totalApprenants, totalSituations, enAttente, validees] =
      await Promise.all([
        this.prisma.apprenant.count({
          where: {
            referentielId: scope.referentielId,
            promotionId: scope.selectedPromotion.id,
          },
        }),
        this.prisma.situationProfessionnelle.count({
          where: {
            apprenant: {
              referentielId: scope.referentielId,
              promotionId: scope.selectedPromotion.id,
            },
          },
        }),
        this.prisma.situationProfessionnelle.count({
          where: {
            valide: false,
            apprenant: {
              referentielId: scope.referentielId,
              promotionId: scope.selectedPromotion.id,
            },
          },
        }),
        this.prisma.situationProfessionnelle.count({
          where: {
            valide: true,
            apprenant: {
              referentielId: scope.referentielId,
              promotionId: scope.selectedPromotion.id,
            },
          },
        }),
      ]);

    const enEmploi = parStatut.EN_EMPLOI;

    return {
      scope,
      totalApprenants,
      totalSituations,
      enAttente,
      validees,
      tauxInsertion:
        totalApprenants === 0
          ? 0
          : Number(((enEmploi / totalApprenants) * 100).toFixed(2)),
      parStatut,
    };
  }

  /**
   * Résout un chemin/clé de document en URL d'accès selon le driver actif.
   */
  private async resolveDocumentSummary<T extends { fichier: string }>(
    document: T,
  ): Promise<T> {
    return {
      ...document,
      fichier: await this.documentsStorage.resolveAccessPath(document.fichier),
    };
  }
}
