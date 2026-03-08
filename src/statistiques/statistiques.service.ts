import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import {
  PROMOTIONS_ERRORS,
  REFERENTIELS_ERRORS,
} from 'src/common/constants/error-messages.constant';
import { CacheVersionService } from 'src/common/services/cache-version.service';
import { StatistiquesGlobalesQueryDto } from './dto/statistiques-globales-query.dto';
import { StatistiquesPeriodeQueryDto } from './dto/statistiques-periode-query.dto';

type PromotionStatsRow = Prisma.PromotionGetPayload<{
  select: {
    id: true;
    nom: true;
    _count: { select: { apprenants: true } };
  };
}>;

type ReferentielStatsRow = Prisma.ReferentielGetPayload<{
  select: {
    id: true;
    nom: true;
    _count: { select: { apprenants: true } };
  };
}>;

type EmploiDistinctRow = Prisma.SituationProfessionnelleGetPayload<{
  select: {
    apprenant: {
      select: {
        promotionId: true;
        referentielId: true;
      };
    };
  };
}>;

@Injectable()
export class StatistiquesService {
  // Cache tres court pour eviter de recalculer les memes statistiques
  // a chaque navigation sur les pages manager/pole emploi.
  private readonly globalStatsCache = new Map<
    string,
    { expiresAt: number; data: unknown }
  >();

  private readonly globalStatsCacheTtlMs = 15_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheVersionService: CacheVersionService,
  ) {}

  // ============================================
  // OUTILS PRIVÉS
  // ============================================

  /** Compteur d'apprenants uniques en emploi */
  private async countEnEmploi(filter: {
    promotionId?: string;
    referentielId?: string;
    createdAt?: { gte?: Date; lte?: Date };
  }): Promise<number> {
    const where: Prisma.SituationProfessionnelleWhereInput = {
      statut: 'EN_EMPLOI',
    };

    if (filter.promotionId || filter.referentielId) {
      where.apprenant = {};
      if (filter.promotionId) {
        where.apprenant.promotionId = filter.promotionId;
      }
      if (filter.referentielId) {
        where.apprenant.referentielId = filter.referentielId;
      }
    }
    if (filter.createdAt) {
      where.createdAt = filter.createdAt;
    }

    const result = await this.prisma.situationProfessionnelle.findMany({
      where,
      select: { apprenantId: true },
      distinct: ['apprenantId'],
    });
    return result.length;
  }

  /** Taux d'insertion en pourcentage */
  private calcTaux(total: number, enEmploi: number): number {
    return total === 0 ? 0 : Number(((enEmploi / total) * 100).toFixed(2));
  }

  /** Stats par statut */
  private async getParStatut(filter: {
    promotionId?: string;
    referentielId?: string;
    createdAt?: { gte?: Date; lte?: Date };
  }) {
    const where: Prisma.SituationProfessionnelleWhereInput = {};

    if (filter.promotionId || filter.referentielId) {
      where.apprenant = {};
      if (filter.promotionId) {
        where.apprenant.promotionId = filter.promotionId;
      }
      if (filter.referentielId) {
        where.apprenant.referentielId = filter.referentielId;
      }
    }
    if (filter.createdAt) {
      where.createdAt = filter.createdAt;
    }

    const grouped = await this.prisma.situationProfessionnelle.groupBy({
      by: ['statut'],
      _count: { _all: true },
      where,
    });

    const parStatut = {
      EN_EMPLOI: 0,
      EN_STAGE: 0,
      RECHERCHE_EMPLOI: 0,
      PROJET_PERSO: 0,
      POURSUITE_ETUDES: 0,
    };

    for (const row of grouped) {
      if (row.statut in parStatut)
        parStatut[row.statut as keyof typeof parStatut] = row._count._all;
    }
    return parStatut;
  }

  private buildGlobalStatsCacheKey(
    promotionId: string | undefined,
    options: StatistiquesGlobalesQueryDto,
  ) {
    return JSON.stringify({
      version: this.cacheVersionService.getVersion('global-stats'),
      promotionId: promotionId ?? null,
      includePromotions: options.includePromotions !== false,
      includeReferentiels: options.includeReferentiels !== false,
      includeSituationsRecentes: options.includeSituationsRecentes !== false,
    });
  }

  private getCachedGlobalStats(cacheKey: string) {
    const cachedEntry = this.globalStatsCache.get(cacheKey);

    if (!cachedEntry) {
      return null;
    }

    if (cachedEntry.expiresAt <= Date.now()) {
      this.globalStatsCache.delete(cacheKey);
      return null;
    }

    return cachedEntry.data;
  }

  private setCachedGlobalStats(cacheKey: string, data: unknown) {
    this.globalStatsCache.set(cacheKey, {
      data,
      expiresAt: Date.now() + this.globalStatsCacheTtlMs,
    });
  }

  // ============================================
  // ENDPOINTS
  // ============================================

  /** Stats globales */
  async getGlobales(
    promotionId?: string,
    options: StatistiquesGlobalesQueryDto = {},
  ) {
    // Le cache depend de la promotion active et des blocs demandes par le frontend.
    const cacheKey = this.buildGlobalStatsCacheKey(promotionId, options);
    const cachedData = this.getCachedGlobalStats(cacheKey);

    if (cachedData) {
      return cachedData;
    }

    const filter = promotionId ? { promotionId } : {};
    const situationsWhere = promotionId ? { apprenant: { promotionId } } : {};
    const includePromotions = options.includePromotions !== false;
    const includeReferentiels = options.includeReferentiels !== false;
    const includeSituationsRecentes =
      options.includeSituationsRecentes !== false;
    const promotionsPromise: Promise<PromotionStatsRow[]> = includePromotions
      ? this.prisma.promotion.findMany({
          ...(promotionId ? { where: { id: promotionId } } : {}),
          select: {
            id: true,
            nom: true,
            _count: { select: { apprenants: true } },
          },
        })
      : Promise.resolve([]);
    const referentielsPromise: Promise<ReferentielStatsRow[]> =
      includeReferentiels
        ? this.prisma.referentiel.findMany({
            ...(promotionId
              ? { where: { apprenants: { some: { promotionId } } } }
              : {}),
            select: {
              id: true,
              nom: true,
              _count: {
                select: {
                  apprenants: promotionId
                    ? { where: { promotionId } }
                    : true,
                },
              },
            },
          })
        : Promise.resolve([]);
    const emploisDistinctsPromise: Promise<EmploiDistinctRow[]> =
      includePromotions || includeReferentiels
        ? this.prisma.situationProfessionnelle.findMany({
            where: {
              statut: 'EN_EMPLOI',
              ...(promotionId ? { apprenant: { promotionId } } : {}),
            },
            distinct: ['apprenantId'],
            select: {
              apprenant: {
                select: {
                  promotionId: true,
                  referentielId: true,
                },
              },
            },
          })
        : Promise.resolve([]);

    const [
      totalApprenants,
      parStatut,
      enEmploi,
      totalSituations,
      enAttente,
      validees,
      situationsRecentes,
      promotions,
      referentiels,
      emploisDistincts,
    ] = await Promise.all([
      promotionId
        ? this.prisma.apprenant.count({ where: { promotionId } })
        : this.prisma.apprenant.count(),
      this.getParStatut(filter),
      this.countEnEmploi(filter),
      this.prisma.situationProfessionnelle.count({ where: situationsWhere }),
      this.prisma.situationProfessionnelle.count({
        where: { ...situationsWhere, valide: false },
      }),
      this.prisma.situationProfessionnelle.count({
        where: { ...situationsWhere, valide: true },
      }),
      includeSituationsRecentes
        ? this.prisma.situationProfessionnelle.findMany({
            where: situationsWhere,
            orderBy: { createdAt: 'desc' },
            take: 5,
            select: {
              id: true,
              statut: true,
              createdAt: true,
              valide: true,
              apprenant: {
                select: { user: { select: { nom: true, prenom: true } } },
              },
            },
          })
        : Promise.resolve([]),
      includePromotions
        ? this.prisma.promotion.findMany({
            ...(promotionId ? { where: { id: promotionId } } : {}),
            select: {
              id: true,
              nom: true,
              _count: { select: { apprenants: true } },
            },
          })
        : Promise.resolve([]),
      includeReferentiels
        ? this.prisma.referentiel.findMany({
            ...(promotionId
              ? { where: { apprenants: { some: { promotionId } } } }
              : {}),
            select: {
              id: true,
              nom: true,
              _count: {
                select: {
                  apprenants: promotionId
                    ? { where: { promotionId } }
                    : true,
                },
              },
            },
          })
        : Promise.resolve([]),
      includePromotions || includeReferentiels
        ? this.prisma.situationProfessionnelle.findMany({
            where: {
              statut: 'EN_EMPLOI',
              ...(promotionId ? { apprenant: { promotionId } } : {}),
            },
            distinct: ['apprenantId'],
            select: {
              apprenant: {
                select: {
                  promotionId: true,
                  referentielId: true,
                },
              },
            },
          })
        : Promise.resolve([]),

      promotionsPromise,
      referentielsPromise,
      emploisDistinctsPromise,
    ]);

    const tauxInsertion = this.calcTaux(totalApprenants, enEmploi);

    const emploiParPromotion = new Map<string, number>();
    const emploiParReferentiel = new Map<string, number>();

    for (const row of emploisDistincts) {
      const apprenant = row.apprenant;
      if (!apprenant) {
        continue;
      }

      emploiParPromotion.set(
        apprenant.promotionId,
        (emploiParPromotion.get(apprenant.promotionId) ?? 0) + 1,
      );
      emploiParReferentiel.set(
        apprenant.referentielId,
        (emploiParReferentiel.get(apprenant.referentielId) ?? 0) + 1,
      );
    }

    const parPromotion = includePromotions
      ? promotions.map((promotion) => {
          const total = promotion._count.apprenants;
          const totalEnEmploi = emploiParPromotion.get(promotion.id) ?? 0;
          const taux = total > 0 ? (totalEnEmploi / total) * 100 : 0;
          let statut = 'En cours';

          if (taux >= 100) {
            statut = 'Terminée';
          } else if (taux >= 50) {
            statut = 'En finale';
          }

          return {
            promotionId: promotion.id,
            promotionNom: promotion.nom,
            total,
            enEmploi: totalEnEmploi,
            statut,
          };
        })
      : [];

    const parReferentiel = includeReferentiels
      ? referentiels.map((referentiel) => ({
          referentielId: referentiel.id,
          referentielNom: referentiel.nom,
          total: referentiel._count.apprenants,
          enEmploi: emploiParReferentiel.get(referentiel.id) ?? 0,
        }))
      : [];

    const result = {
      totalApprenants,
      totalSituations,
      enAttente,
      validees,
      tauxInsertion,
      parStatut,
      situationsRecentes,
      parPromotion,
      parReferentiel,
    };

    this.setCachedGlobalStats(cacheKey, result);

    return result;
  }

  /** Stats par promotion */
  async getByPromotion(promotionId: string) {
    const promotion = await this.prisma.promotion.findUnique({
      where: { id: promotionId },
      select: { id: true, nom: true, annee: true },
    });
    if (!promotion)
      throw new NotFoundException(PROMOTIONS_ERRORS.NOT_FOUND.message);

    const totalApprenants = await this.prisma.apprenant.count({
      where: { promotionId },
    });
    const parStatut = await this.getParStatut({ promotionId });
    const enEmploi = await this.countEnEmploi({ promotionId });
    const situationsWhere = { apprenant: { promotionId } };

    const [totalSituations, enAttente, validees] = await Promise.all([
      this.prisma.situationProfessionnelle.count({ where: situationsWhere }),
      this.prisma.situationProfessionnelle.count({
        where: { ...situationsWhere, valide: false },
      }),
      this.prisma.situationProfessionnelle.count({
        where: { ...situationsWhere, valide: true },
      }),
    ]);

    const situationsRecentes =
      await this.prisma.situationProfessionnelle.findMany({
        where: situationsWhere,
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          statut: true,
          createdAt: true,
          valide: true,
          apprenant: {
            select: { user: { select: { nom: true, prenom: true } } },
          },
        },
      });

    return {
      promotion,
      totalApprenants,
      totalSituations,
      enAttente,
      validees,
      tauxInsertion: this.calcTaux(totalApprenants, enEmploi),
      parStatut,
      situationsRecentes,
    };
  }

  /** Stats par référentiel */
  async getByReferentiel(referentielId: string) {
    const referentiel = await this.prisma.referentiel.findUnique({
      where: { id: referentielId },
      select: { id: true, nom: true },
    });
    if (!referentiel)
      throw new NotFoundException(REFERENTIELS_ERRORS.NOT_FOUND.message);

    const totalApprenants = await this.prisma.apprenant.count({
      where: { referentielId },
    });
    const parStatut = await this.getParStatut({ referentielId });
    const enEmploi = await this.countEnEmploi({ referentielId });

    return {
      referentiel,
      totalApprenants,
      tauxInsertion: this.calcTaux(totalApprenants, enEmploi),
      parStatut,
    };
  }

  /** Stats par période */
  async getByPeriode(query: StatistiquesPeriodeQueryDto) {
    const { dateFrom, dateTo } = query;
    const from = dateFrom ? new Date(dateFrom) : undefined;
    const to = dateTo ? new Date(dateTo) : undefined;

    if (from && to && from > to)
      throw new BadRequestException('dateFrom doit être <= dateTo');

    const createdAt = {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {}),
    };
    const hasDateFilter = Boolean(from || to);

    const totalApprenants = await this.prisma.apprenant.count();
    const parStatut = await this.getParStatut(
      hasDateFilter ? { createdAt } : {},
    );
    const enEmploi = await this.countEnEmploi(
      hasDateFilter ? { createdAt } : {},
    );

    return {
      periode: { dateFrom: dateFrom ?? null, dateTo: dateTo ?? null },
      totalApprenants,
      tauxInsertion: this.calcTaux(totalApprenants, enEmploi),
      parStatut,
    };
  }
}
