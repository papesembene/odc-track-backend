import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { InOdcClientService } from 'src/integrations/in-odc/in-odc-client.service';
import { InOdcPromotion } from 'src/integrations/in-odc/in-odc.types';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { PromotionsQueryDto } from './dto/promotions-query.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';
import { PROMOTIONS_ERRORS } from 'src/common/constants/error-messages.constant';
import { CacheVersionService } from 'src/common/services/cache-version.service';
import {
  buildPaginationMeta,
  normalizePagination,
} from 'src/common/helpers/pagination.helper';

type MasterPromotionData = {
  id: string;
  inOdcId: string | null;
  nom: string;
  annee: number;
  estActive: boolean;
  statut: string;
  dateDebut: string | null;
  dateFin: string | null;
  photoUrl: string | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
  referentiels: Array<{
    referentielId: string;
    referentiel: {
      id: string;
      nom: string;
      description: string | null;
    };
  }>;
  totalApprenants?: number;
  enEmploi?: number;
  tauxInsertion?: number;
};

@Injectable()
export class PromotionsService {
  private readonly logger = new Logger(PromotionsService.name);
  private readonly masterPromotionsCache = new Map<
    string,
    { expiresAt: number; data: Awaited<ReturnType<PromotionsService['findAllFromInOdc']>> }
  >();
  private readonly masterPromotionsCacheTtlMs = 120_000;
  private readonly promotionWithReferentielsSelect = {
    id: true,
    nom: true,
    annee: true,
    estActive: true,
    createdAt: true,
    updatedAt: true,
    referentiels: {
      select: {
        referentielId: true,
        referentiel: {
          select: {
            id: true,
            nom: true,
            description: true,
          },
        },
      },
    },
  } as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheVersionService: CacheVersionService,
    private readonly inOdcClientService: InOdcClientService,
  ) {}

  create(dto: CreatePromotionDto): never {
    void dto;
    throw new ForbiddenException(
      'Les promotions sont gerees dans in-odc. La creation locale est desactivee dans Suivi insertion.',
    );
  }

  async findAll(query: PromotionsQueryDto) {
    const { page, limit, skip } = normalizePagination(query);
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';

    const where: Prisma.PromotionWhereInput = {
      ...(query.search
        ? { nom: { contains: query.search, mode: 'insensitive' } }
        : {}),
      ...(typeof query.annee === 'number' ? { annee: query.annee } : {}),
      ...(query.referentielId
        ? {
            referentiels: {
              some: {
                referentielId: query.referentielId,
              },
            },
          }
        : {}),
    };

    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.promotion.findMany({
        where,
        skip,
        take: limit,
        // On selectionne uniquement les champs utiles aux ecrans et filtres.
        select: this.promotionWithReferentielsSelect,
        orderBy: { [sortBy]: sortOrder },
      }),
      this.prisma.promotion.count({ where }),
    ]);

    return {
      items,
      pagination: buildPaginationMeta(page, limit, totalItems),
    };
  }

  async findAllFromInOdc(query: PromotionsQueryDto) {
    const cacheKey = JSON.stringify({
      search: query.search ?? null,
      annee: query.annee ?? null,
      referentielId: query.referentielId ?? null,
      sortBy: query.sortBy ?? 'createdAt',
      sortOrder: query.sortOrder ?? 'desc',
      page: query.page ?? 1,
      limit: query.limit ?? 10,
      includeMetrics: query.includeMetrics !== false,
    });
    const cached = this.masterPromotionsCache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const { page, limit } = normalizePagination(query);
    const includeMetrics = query.includeMetrics !== false;
    const [rawPromotions, masterLearners] = await Promise.all([
      this.inOdcClientService.getPromotions(),
      includeMetrics
        ? this.inOdcClientService.getAllReferenceLearners()
        : Promise.resolve([]),
    ]);
    const normalizedPromotions: MasterPromotionData[] = rawPromotions.map(
      (promotion) => this.normalizeInOdcPromotion(promotion),
    );
    const historicalPromotions =
      await this.getHistoricalLocalPromotions(normalizedPromotions);
    const allPromotions: MasterPromotionData[] = [
      ...normalizedPromotions,
      ...historicalPromotions,
    ];

    const filteredItems = allPromotions
      .filter((promotion) => {
        if (
          query.search &&
          !promotion.nom.toLowerCase().includes(query.search.toLowerCase())
        ) {
          return false;
        }

        if (
          typeof query.annee === 'number' &&
          promotion.annee !== query.annee
        ) {
          return false;
        }

        if (
          query.referentielId &&
          !promotion.referentiels.some(
            (item) => item.referentielId === query.referentielId,
          )
        ) {
          return false;
        }

        return true;
      })
      .sort((left, right) => this.compareMasterPromotions(left, right, query));

    const filteredPromotionIds = new Set(filteredItems.map((item) => item.id));
    const relevantLearners = includeMetrics
      ? masterLearners.filter((learner) =>
          filteredPromotionIds.has(learner.promotion.id),
        )
      : [];
    const emploiByPromotion = includeMetrics
      ? await this.buildMasterPromotionEmploymentMap(relevantLearners)
      : new Map<string, number>();
    const learnersCountByPromotion = new Map<string, number>();

    if (includeMetrics) {
      for (const learner of relevantLearners) {
        learnersCountByPromotion.set(
          learner.promotion.id,
          (learnersCountByPromotion.get(learner.promotion.id) ?? 0) + 1,
        );
      }
    }

    const totalItems = filteredItems.length;
    const start = (page - 1) * limit;
    const items = filteredItems.slice(start, start + limit).map((promotion) => {
      if (!includeMetrics) {
        return promotion;
      }

      const totalApprenants = learnersCountByPromotion.get(promotion.id) ?? 0;
      const enEmploi =
        promotion.totalApprenants !== undefined &&
        promotion.enEmploi !== undefined
          ? promotion.enEmploi
          : (emploiByPromotion.get(promotion.id) ?? 0);

      return {
        ...promotion,
        totalApprenants: promotion.totalApprenants ?? totalApprenants,
        enEmploi,
        tauxInsertion:
          promotion.tauxInsertion ??
          this.calcTaux(promotion.totalApprenants ?? totalApprenants, enEmploi),
      };
    });

    const result = {
      items,
      pagination: buildPaginationMeta(page, limit, totalItems),
    };

    this.masterPromotionsCache.set(cacheKey, {
      data: result,
      expiresAt: Date.now() + this.masterPromotionsCacheTtlMs,
    });

    return result;
  }

  async getActiveFromInOdc() {
    const promotion = await this.inOdcClientService.getActivePromotion();
    return this.normalizeInOdcPromotion(promotion);
  }

  async findOne(id: string) {
    const item = await this.prisma.promotion.findUnique({
      where: { id },
      select: this.promotionWithReferentielsSelect,
    });

    if (!item) {
      throw new NotFoundException(PROMOTIONS_ERRORS.NOT_FOUND.message);
    }

    return item;
  }

  update(id: string, dto: UpdatePromotionDto): never {
    void id;
    void dto;
    throw new ForbiddenException(
      'Les promotions sont gerees dans in-odc. La modification locale est desactivee dans Suivi insertion.',
    );
  }

  remove(id: string): never {
    void id;
    throw new ForbiddenException(
      'Les promotions sont gerees dans in-odc. La suppression locale est desactivee dans Suivi insertion.',
    );
  }

  /**
   * Active une promotion et désactive automatiquement toutes les autres
   * (une seule promotion peut être active à la fois)
   */
  setActive(id: string): never {
    void id;
    throw new ForbiddenException(
      "L'activation de promotion se fait dans in-odc. Cette action est desactivee dans Suivi insertion.",
    );
  }

  /**
   * Récupère la promotion active (si aucune n'est active, retourne null)
   */
  async getActive() {
    try {
      return await this.prisma.promotion.findFirst({
        where: { estActive: true },
        select: this.promotionWithReferentielsSelect,
      });
    } catch (error) {
      if (!this.isMissingEstActiveColumnError(error)) {
        throw error;
      }

      this.logger.warn(
        'Le champ Promotion.estActive semble absent en base. Fallback sur la promotion la plus recente.',
      );

      return this.prisma.promotion.findFirst({
        orderBy: [{ annee: 'desc' }, { createdAt: 'desc' }],
        select: this.promotionWithReferentielsSelect,
      });
    }
  }

  private isMissingEstActiveColumnError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const message = error.message.toLowerCase();
    return (
      message.includes('estactive') &&
      (message.includes('does not exist') ||
        message.includes('unknown arg') ||
        message.includes('column') ||
        message.includes('unknown field'))
    );
  }

  private normalizeInOdcPromotion(
    promotion: InOdcPromotion,
  ): MasterPromotionData {
    return {
      id: promotion.id,
      inOdcId: promotion.id,
      nom: promotion.name,
      annee: new Date(promotion.startDate).getFullYear(),
      estActive: promotion.status === 'ACTIVE',
      statut: promotion.status,
      dateDebut: promotion.startDate,
      dateFin: promotion.endDate,
      photoUrl: promotion.photoUrl ?? null,
      createdAt: null,
      updatedAt: null,
      referentiels: (promotion.referentials ?? []).map((referential) => ({
        referentielId: referential.id,
        referentiel: {
          id: referential.id,
          nom: referential.name,
          description: referential.description ?? null,
        },
      })),
    };
  }

  private async getHistoricalLocalPromotions(
    masterPromotions: MasterPromotionData[],
  ): Promise<MasterPromotionData[]> {
    const masterPromotionNames = new Set(
      masterPromotions.map((promotion) => this.normalizeText(promotion.nom)),
    );

    const localPromotions = await this.prisma.promotion.findMany({
      include: {
        referentiels: {
          select: {
            referentielId: true,
            referentiel: {
              select: {
                id: true,
                nom: true,
                description: true,
              },
            },
          },
        },
        apprenants: {
          select: {
            id: true,
            situations: {
              where: {
                statut: 'EN_EMPLOI',
              },
              select: {
                id: true,
              },
              take: 1,
            },
          },
        },
      },
    });

    return localPromotions
      .filter(
        (promotion) =>
          !masterPromotionNames.has(this.normalizeText(promotion.nom)),
      )
      .map((promotion) => {
        const totalApprenants = promotion.apprenants.length;
        const enEmploi = promotion.apprenants.filter(
          (apprenant) => apprenant.situations.length > 0,
        ).length;

        return {
          id: promotion.id,
          inOdcId: null,
          nom: promotion.nom,
          annee: promotion.annee,
          dateDebut: null,
          dateFin: null,
          photoUrl: null,
          statut: 'HISTORIQUE',
          estActive: false,
          createdAt: promotion.createdAt,
          updatedAt: promotion.updatedAt,
          referentiels: promotion.referentiels,
          totalApprenants,
          enEmploi,
          tauxInsertion: this.calcTaux(totalApprenants, enEmploi),
        };
      });
  }

  private normalizeText(value: string) {
    return value.trim().toLowerCase();
  }

  private calcTaux(total: number, enEmploi: number) {
    return total === 0 ? 0 : Number(((enEmploi / total) * 100).toFixed(2));
  }

  private async buildMasterPromotionEmploymentMap(
    learners: Array<{
      promotion: { id: string };
      user: { email: string };
      phone: string;
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
        situations: {
          where: {
            statut: 'EN_EMPLOI',
          },
          select: {
            id: true,
          },
          take: 1,
        },
      },
    });

    const emploiByEmail = new Map<string, boolean>();
    const emploiByPhone = new Map<string, boolean>();

    for (const apprenant of localApprenants) {
      const hasEmployment = apprenant.situations.length > 0;
      const normalizedEmail = apprenant.user.email.trim().toLowerCase();
      emploiByEmail.set(normalizedEmail, hasEmployment);

      if (apprenant.telephone?.trim()) {
        emploiByPhone.set(apprenant.telephone.trim(), hasEmployment);
      }
    }

    const result = new Map<string, number>();

    for (const learner of learners) {
      const normalizedEmail = learner.user.email?.trim().toLowerCase();
      const normalizedPhone = learner.phone?.trim();
      const hasEmployment =
        (normalizedEmail ? emploiByEmail.get(normalizedEmail) : undefined) ??
        (normalizedPhone ? emploiByPhone.get(normalizedPhone) : undefined) ??
        false;

      if (!hasEmployment) {
        continue;
      }

      result.set(
        learner.promotion.id,
        (result.get(learner.promotion.id) ?? 0) + 1,
      );
    }

    return result;
  }

  private compareMasterPromotions(
    left: ReturnType<PromotionsService['normalizeInOdcPromotion']>,
    right: ReturnType<PromotionsService['normalizeInOdcPromotion']>,
    query: PromotionsQueryDto,
  ) {
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';

    let comparison = 0;

    if (sortBy === 'nom') {
      comparison = left.nom.localeCompare(right.nom, 'fr', {
        sensitivity: 'base',
      });
    } else if (sortBy === 'annee') {
      comparison = left.annee - right.annee;
    } else {
      comparison =
        new Date(left.dateDebut ?? 0).getTime() -
        new Date(right.dateDebut ?? 0).getTime();
    }

    return sortOrder === 'asc' ? comparison : comparison * -1;
  }
}
