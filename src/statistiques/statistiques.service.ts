import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { InOdcClientService } from 'src/integrations/in-odc/in-odc-client.service';
import {
  InOdcReferenceLearner,
  InOdcPromotion,
  InOdcReferential,
} from 'src/integrations/in-odc/in-odc.types';
import {
  PROMOTIONS_ERRORS,
  REFERENTIELS_ERRORS,
} from 'src/common/constants/error-messages.constant';
import { CacheVersionService } from 'src/common/services/cache-version.service';
import { StatistiquesGlobalesQueryDto } from './dto/statistiques-globales-query.dto';
import { StatistiquesPeriodeQueryDto } from './dto/statistiques-periode-query.dto';

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
    private readonly inOdcClientService: InOdcClientService,
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
    if (await this.isHistoricalPromotionSelection(promotionId)) {
      return this.buildHistoricalGlobalStats(promotionId!, options);
    }

    // Le cache depend de la promotion active et des blocs demandes par le frontend.
    const cacheKey = this.buildGlobalStatsCacheKey(promotionId, options);
    const cachedData = this.getCachedGlobalStats(cacheKey);

    if (cachedData) {
      return cachedData;
    }

    const includePromotions = options.includePromotions !== false;
    const includeReferentiels = options.includeReferentiels !== false;
    const includeSituationsRecentes =
      options.includeSituationsRecentes !== false;
    const result = await this.buildMasterGlobalStats({
      promotionId,
      includePromotions,
      includeReferentiels,
      includeSituationsRecentes,
    });

    this.setCachedGlobalStats(cacheKey, result);

    return result;
  }

  private async buildMasterGlobalStats(options: {
    promotionId?: string;
    includePromotions: boolean;
    includeReferentiels: boolean;
    includeSituationsRecentes: boolean;
  }) {
    const [learners, promotions, referentials] = await Promise.all([
      this.inOdcClientService.getAllReferenceLearners({
        promotionId: options.promotionId,
      }),
      options.includePromotions
        ? this.inOdcClientService.getPromotions()
        : Promise.resolve([] as InOdcPromotion[]),
      options.includeReferentiels
        ? this.inOdcClientService.getReferentials()
        : Promise.resolve([] as InOdcReferential[]),
    ]);
    const historicalStats = await this.getHistoricalGlobalStats({
      promotionId: options.promotionId,
      masterPromotions: promotions,
      includePromotions: options.includePromotions,
      includeReferentiels: options.includeReferentiels,
      includeSituationsRecentes: options.includeSituationsRecentes,
    });

    const localApprenants =
      await this.findLocalApprenantsForMasterLearners(learners);
    const localByIdentity =
      this.indexLocalApprenantsByIdentity(localApprenants);
    const masterWithLocal = learners.map((learner) => ({
      learner,
      local:
        localByIdentity.get(
          `email:${learner.user.email.trim().toLowerCase()}`,
        ) ??
        (learner.phone?.trim()
          ? localByIdentity.get(`phone:${learner.phone.trim()}`)
          : undefined) ??
        null,
    }));

    const totalApprenants = learners.length + historicalStats.totalApprenants;
    const totalSituations =
      masterWithLocal.reduce(
        (sum, item) => sum + (item.local?.situations.length ?? 0),
        0,
      ) + historicalStats.totalSituations;
    const validees =
      masterWithLocal.reduce(
        (sum, item) =>
          sum +
          (item.local?.situations.filter((situation) => situation.valide)
            .length ?? 0),
        0,
      ) + historicalStats.validees;
    const enAttente = totalSituations - validees;

    const parStatut = {
      EN_EMPLOI: 0,
      EN_STAGE: 0,
      RECHERCHE_EMPLOI: 0,
      PROJET_PERSO: 0,
      POURSUITE_ETUDES: 0,
    };
    const emploiLearnerIds = new Set<string>();

    for (const item of masterWithLocal) {
      const situations = item.local?.situations ?? [];

      for (const situation of situations) {
        if (situation.statut in parStatut) {
          parStatut[situation.statut as keyof typeof parStatut] += 1;
        }

        if (situation.statut === 'EN_EMPLOI') {
          emploiLearnerIds.add(item.learner.id);
        }
      }
    }

    for (const status of Object.keys(parStatut) as Array<
      keyof typeof parStatut
    >) {
      parStatut[status] += historicalStats.parStatut[status];
    }

    const enEmploi = emploiLearnerIds.size + historicalStats.enEmploi;
    const tauxInsertion = this.calcTaux(totalApprenants, enEmploi);

    const parPromotion = options.includePromotions
      ? [
          ...this.buildMasterPromotionStats(
            promotions,
            masterWithLocal,
            options.promotionId,
            emploiLearnerIds,
          ),
          ...historicalStats.parPromotion,
        ]
      : [];

    const parReferentiel = options.includeReferentiels
      ? this.mergeReferentialStats(
          this.buildMasterReferentialStats(
            referentials,
            masterWithLocal,
            emploiLearnerIds,
          ),
          historicalStats.parReferentiel,
        )
      : [];

    const situationsRecentes = options.includeSituationsRecentes
      ? [
          ...masterWithLocal.flatMap((item) =>
            (item.local?.situations ?? []).map((situation) => ({
              id: situation.id,
              statut: situation.statut,
              createdAt: situation.createdAt,
              valide: situation.valide,
              apprenant: {
                user: {
                  nom: item.learner.lastName,
                  prenom: item.learner.firstName,
                },
              },
            })),
          ),
          ...historicalStats.situationsRecentes,
        ]
          .sort(
            (left, right) =>
              new Date(right.createdAt).getTime() -
              new Date(left.createdAt).getTime(),
          )
          .slice(0, 5)
      : [];

    return {
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
  }

  private async getHistoricalGlobalStats(options: {
    promotionId?: string;
    masterPromotions: InOdcPromotion[];
    includePromotions: boolean;
    includeReferentiels: boolean;
    includeSituationsRecentes: boolean;
  }) {
    if (options.promotionId) {
      return {
        totalApprenants: 0,
        totalSituations: 0,
        validees: 0,
        enEmploi: 0,
        parStatut: {
          EN_EMPLOI: 0,
          EN_STAGE: 0,
          RECHERCHE_EMPLOI: 0,
          PROJET_PERSO: 0,
          POURSUITE_ETUDES: 0,
        },
        parPromotion: [] as Array<{
          promotionId: string;
          promotionNom: string;
          total: number;
          enEmploi: number;
        }>,
        parReferentiel: [] as Array<{
          referentielId: string;
          referentielNom: string;
          total: number;
          enEmploi: number;
        }>,
        situationsRecentes: [] as Array<{
          id: string;
          statut: string;
          createdAt: Date;
          valide: boolean;
          apprenant: { user: { nom: string; prenom: string } };
        }>,
      };
    }

    const masterPromotionNames = new Set(
      options.masterPromotions.map((promotion) =>
        this.normalizeText(promotion.name),
      ),
    );

    const historicalPromotions = await this.prisma.promotion.findMany({
      where: {
        apprenants: {
          some: {},
        },
      },
      select: {
        id: true,
        nom: true,
        apprenants: {
          select: {
            id: true,
            referentiel: {
              select: {
                id: true,
                nom: true,
              },
            },
            situations: {
              select: {
                id: true,
                statut: true,
                createdAt: true,
                valide: true,
              },
              orderBy: { createdAt: 'desc' },
            },
            user: {
              select: {
                nom: true,
                prenom: true,
              },
            },
          },
        },
      },
    });

    const filteredPromotions = historicalPromotions.filter(
      (promotion) =>
        !masterPromotionNames.has(this.normalizeText(promotion.nom)),
    );

    const parStatut = {
      EN_EMPLOI: 0,
      EN_STAGE: 0,
      RECHERCHE_EMPLOI: 0,
      PROJET_PERSO: 0,
      POURSUITE_ETUDES: 0,
    };
    const referentielMap = new Map<
      string,
      {
        referentielId: string;
        referentielNom: string;
        total: number;
        enEmploi: number;
      }
    >();
    const situationsRecentes: Array<{
      id: string;
      statut: string;
      createdAt: Date;
      valide: boolean;
      apprenant: { user: { nom: string; prenom: string } };
    }> = [];

    let totalApprenants = 0;
    let totalSituations = 0;
    let validees = 0;
    let enEmploi = 0;

    const parPromotion = filteredPromotions.map((promotion) => {
      totalApprenants += promotion.apprenants.length;
      let promotionEnEmploi = 0;

      for (const apprenant of promotion.apprenants) {
        const hasEmploi = apprenant.situations.some(
          (situation) => situation.statut === 'EN_EMPLOI',
        );
        if (hasEmploi) {
          promotionEnEmploi += 1;
          enEmploi += 1;
        }

        const referentielStats = referentielMap.get(
          apprenant.referentiel.nom,
        ) ?? {
          referentielId: apprenant.referentiel.id,
          referentielNom: apprenant.referentiel.nom,
          total: 0,
          enEmploi: 0,
        };
        referentielStats.total += 1;
        if (hasEmploi) {
          referentielStats.enEmploi += 1;
        }
        referentielMap.set(apprenant.referentiel.nom, referentielStats);

        totalSituations += apprenant.situations.length;
        validees += apprenant.situations.filter((item) => item.valide).length;

        for (const situation of apprenant.situations) {
          if (situation.statut in parStatut) {
            parStatut[situation.statut as keyof typeof parStatut] += 1;
          }
          if (options.includeSituationsRecentes) {
            situationsRecentes.push({
              id: situation.id,
              statut: situation.statut,
              createdAt: situation.createdAt,
              valide: situation.valide,
              apprenant: {
                user: {
                  nom: apprenant.user.nom,
                  prenom: apprenant.user.prenom,
                },
              },
            });
          }
        }
      }

      return {
        promotionId: promotion.id,
        promotionNom: promotion.nom,
        total: promotion.apprenants.length,
        enEmploi: promotionEnEmploi,
      };
    });

    return {
      totalApprenants,
      totalSituations,
      validees,
      enEmploi,
      parStatut,
      parPromotion: options.includePromotions ? parPromotion : [],
      parReferentiel: options.includeReferentiels
        ? Array.from(referentielMap.values())
        : [],
      situationsRecentes,
    };
  }

  private mergeReferentialStats(
    left: Array<{
      referentielId: string;
      referentielNom: string;
      total: number;
      enEmploi: number;
    }>,
    right: Array<{
      referentielId: string;
      referentielNom: string;
      total: number;
      enEmploi: number;
    }>,
  ) {
    const merged = new Map<
      string,
      {
        referentielId: string;
        referentielNom: string;
        total: number;
        enEmploi: number;
      }
    >();

    for (const item of [...left, ...right]) {
      const key = this.normalizeText(item.referentielNom);
      const current = merged.get(key) ?? {
        referentielId: item.referentielId,
        referentielNom: item.referentielNom,
        total: 0,
        enEmploi: 0,
      };

      current.total += item.total;
      current.enEmploi += item.enEmploi;
      merged.set(key, current);
    }

    return Array.from(merged.values());
  }

  private async buildHistoricalGlobalStats(
    promotionId: string,
    options: StatistiquesGlobalesQueryDto,
  ) {
    const promotion = await this.prisma.promotion.findUnique({
      where: { id: promotionId },
      select: {
        id: true,
        nom: true,
        annee: true,
        apprenants: {
          select: {
            id: true,
            referentiel: {
              select: {
                id: true,
                nom: true,
              },
            },
            situations: {
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
              orderBy: { createdAt: 'desc' },
            },
          },
        },
      },
    });

    if (!promotion) {
      throw new NotFoundException(PROMOTIONS_ERRORS.NOT_FOUND.message);
    }

    const totalApprenants = promotion.apprenants.length;
    const allSituations = promotion.apprenants.flatMap(
      (apprenant) => apprenant.situations,
    );
    const totalSituations = allSituations.length;
    const validees = allSituations.filter((item) => item.valide).length;
    const enAttente = totalSituations - validees;
    const emploiLearnerIds = new Set(
      promotion.apprenants
        .filter((apprenant) =>
          apprenant.situations.some(
            (situation) => situation.statut === 'EN_EMPLOI',
          ),
        )
        .map((apprenant) => apprenant.id),
    );
    const enEmploi = emploiLearnerIds.size;

    const parStatut = {
      EN_EMPLOI: 0,
      EN_STAGE: 0,
      RECHERCHE_EMPLOI: 0,
      PROJET_PERSO: 0,
      POURSUITE_ETUDES: 0,
    };

    for (const situation of allSituations) {
      if (situation.statut in parStatut) {
        parStatut[situation.statut as keyof typeof parStatut] += 1;
      }
    }

    const includePromotions = options.includePromotions !== false;
    const includeReferentiels = options.includeReferentiels !== false;
    const includeSituationsRecentes =
      options.includeSituationsRecentes !== false;

    const referentielMap = new Map<
      string,
      { referentielNom: string; total: number; enEmploi: number }
    >();

    for (const apprenant of promotion.apprenants) {
      const existing = referentielMap.get(apprenant.referentiel.id) ?? {
        referentielNom: apprenant.referentiel.nom,
        total: 0,
        enEmploi: 0,
      };

      existing.total += 1;
      if (emploiLearnerIds.has(apprenant.id)) {
        existing.enEmploi += 1;
      }
      referentielMap.set(apprenant.referentiel.id, existing);
    }

    return {
      totalApprenants,
      totalSituations,
      enAttente,
      validees,
      tauxInsertion: this.calcTaux(totalApprenants, enEmploi),
      parStatut,
      situationsRecentes: includeSituationsRecentes
        ? [...allSituations]
            .sort(
              (left, right) =>
                new Date(right.createdAt).getTime() -
                new Date(left.createdAt).getTime(),
            )
            .slice(0, 5)
        : [],
      parPromotion: includePromotions
        ? [
            {
              promotionId: promotion.id,
              promotionNom: promotion.nom,
              total: totalApprenants,
              enEmploi,
            },
          ]
        : [],
      parReferentiel: includeReferentiels
        ? Array.from(referentielMap.entries()).map(([referentielId, item]) => ({
            referentielId,
            referentielNom: item.referentielNom,
            total: item.total,
            enEmploi: item.enEmploi,
          }))
        : [],
    };
  }

  private async findLocalApprenantsForMasterLearners(
    learners: InOdcReferenceLearner[],
  ) {
    const emails = Array.from(
      new Set(
        learners
          .map((learner) => learner.user.email?.trim().toLowerCase())
          .filter((value): value is string => Boolean(value)),
      ),
    );
    const phones = Array.from(
      new Set(
        learners
          .map((learner) => learner.phone?.trim())
          .filter((value): value is string => Boolean(value)),
      ),
    );

    const orConditions: Prisma.ApprenantWhereInput[] = [];

    if (emails.length > 0) {
      orConditions.push({
        user: {
          email: {
            in: emails,
          },
        },
      });
    }

    if (phones.length > 0) {
      orConditions.push({
        telephone: {
          in: phones,
        },
      });
    }

    if (orConditions.length === 0) {
      return [];
    }

    return this.prisma.apprenant.findMany({
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
        situations: {
          select: {
            id: true,
            statut: true,
            createdAt: true,
            valide: true,
          },
        },
      },
    });
  }

  private indexLocalApprenantsByIdentity(
    apprenants: Array<{
      telephone: string | null;
      user: { email: string };
      situations: Array<{
        id: string;
        statut: string;
        createdAt: Date;
        valide: boolean;
      }>;
    }>,
  ) {
    const result = new Map<string, (typeof apprenants)[number]>();

    for (const apprenant of apprenants) {
      result.set(
        `email:${apprenant.user.email.trim().toLowerCase()}`,
        apprenant,
      );

      if (apprenant.telephone?.trim()) {
        result.set(`phone:${apprenant.telephone.trim()}`, apprenant);
      }
    }

    return result;
  }

  private buildMasterPromotionStats(
    promotions: InOdcPromotion[],
    masterWithLocal: Array<{
      learner: InOdcReferenceLearner;
      local: {
        situations: Array<{
          statut: string;
          createdAt: Date;
          id: string;
          valide: boolean;
        }>;
      } | null;
    }>,
    promotionId: string | undefined,
    emploiLearnerIds: Set<string>,
  ) {
    const learnersByPromotion = new Map<string, number>();

    for (const item of masterWithLocal) {
      const id = item.learner.promotion.id;
      learnersByPromotion.set(id, (learnersByPromotion.get(id) ?? 0) + 1);
    }

    return promotions
      .filter((promotion) => !promotionId || promotion.id === promotionId)
      .map((promotion) => {
        const total = learnersByPromotion.get(promotion.id) ?? 0;
        const enEmploi = masterWithLocal.filter(
          (item) =>
            item.learner.promotion.id === promotion.id &&
            emploiLearnerIds.has(item.learner.id),
        ).length;

        return {
          promotionId: promotion.id,
          promotionNom: promotion.name,
          total,
          enEmploi,
          statut: promotion.status,
        };
      });
  }

  private buildMasterReferentialStats(
    referentials: InOdcReferential[],
    masterWithLocal: Array<{
      learner: InOdcReferenceLearner;
      local: {
        situations: Array<{
          statut: string;
          createdAt: Date;
          id: string;
          valide: boolean;
        }>;
      } | null;
    }>,
    emploiLearnerIds: Set<string>,
  ) {
    const learnersByReferential = new Map<string, number>();

    for (const item of masterWithLocal) {
      const referentialId = item.learner.referential?.id;

      if (!referentialId) {
        continue;
      }

      learnersByReferential.set(
        referentialId,
        (learnersByReferential.get(referentialId) ?? 0) + 1,
      );
    }

    return referentials
      .filter((referential) => learnersByReferential.has(referential.id))
      .map((referential) => ({
        referentielId: referential.id,
        referentielNom: referential.name,
        total: learnersByReferential.get(referential.id) ?? 0,
        enEmploi: masterWithLocal.filter(
          (item) =>
            item.learner.referential?.id === referential.id &&
            emploiLearnerIds.has(item.learner.id),
        ).length,
      }));
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

  private async isHistoricalPromotionSelection(promotionId?: string) {
    if (!promotionId) {
      return false;
    }

    const [localPromotion, masterPromotions] = await Promise.all([
      this.prisma.promotion.findUnique({
        where: { id: promotionId },
        select: { id: true },
      }),
      this.inOdcClientService.getPromotions(),
    ]);

    if (!localPromotion) {
      return false;
    }

    return !masterPromotions.some((promotion) => promotion.id === promotionId);
  }

  private normalizeText(value: string) {
    return value.trim().toLowerCase();
  }
}
