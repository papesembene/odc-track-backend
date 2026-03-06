import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

@Injectable()
export class PromotionsService {
  private readonly logger = new Logger(PromotionsService.name);
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
  ) {}

  async create(dto: CreatePromotionDto) {
    return this.prisma.promotion.create({
      data: {
        nom: dto.nom,
        annee: dto.annee,
        referentiels: {
          create: dto.referentielIds.map((referentielId) => ({
            referentiel: { connect: { id: referentielId } },
          })),
        },
      },
      select: this.promotionWithReferentielsSelect,
    });
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

  async update(id: string, dto: UpdatePromotionDto) {
    await this.findOne(id);

    const shouldUpdateReferentiels =
      Array.isArray(dto.referentielIds) && dto.referentielIds.length >= 0;

    return this.prisma.promotion.update({
      where: { id },
      data: {
        nom: dto.nom,
        annee: dto.annee,
        ...(shouldUpdateReferentiels
          ? {
              referentiels: {
                deleteMany: {},
                create: dto.referentielIds!.map((referentielId) => ({
                  referentiel: { connect: { id: referentielId } },
                })),
              },
            }
          : {}),
      },
      select: this.promotionWithReferentielsSelect,
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    await this.prisma.promotion.delete({
      where: { id },
    });

    return { message: 'Promotion supprimée avec succès' };
  }

  /**
   * Active une promotion et désactive automatiquement toutes les autres
   * (une seule promotion peut être active à la fois)
   */
  async setActive(id: string) {
    // Vérifier que la promotion existe
    await this.findOne(id);

    // Utiliser une transaction pour:
    // 1. Désactiver toutes les promotions
    // 2. Activer la promotion sélectionnée
    const result = await this.prisma.$transaction(async (tx) => {
      // Désactiver toutes les promotions
      await tx.promotion.updateMany({
        where: { estActive: true },
        data: { estActive: false },
      });

      // Activer la promotion sélectionnée
      const updated = await tx.promotion.update({
        where: { id },
        data: { estActive: true },
        select: this.promotionWithReferentielsSelect,
      });

      return updated;
    });

    // Une promotion active modifie directement les statistiques manager.
    // On invalide donc le cache des stats pour que la prochaine lecture
    // recalcule immediatement les donnees.
    this.cacheVersionService.bumpVersion('global-stats');

    return result;
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
}
