import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { PromotionsQueryDto } from './dto/promotions-query.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';
import { PROMOTIONS_ERRORS } from 'src/common/constants/error-messages.constant';
import {
  buildPaginationMeta,
  normalizePagination,
} from 'src/common/helpers/pagination.helper';

@Injectable()
export class PromotionsService {
  constructor(private readonly prisma: PrismaService) {}

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
      include: {
        referentiels: {
          include: {
            referentiel: true,
          },
        },
      },
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
        include: {
          referentiels: {
            include: {
              referentiel: true,
            },
          },
        },
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
      include: {
        referentiels: {
          include: {
            referentiel: true,
          },
        },
      },
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
      include: {
        referentiels: {
          include: {
            referentiel: true,
          },
        },
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    await this.prisma.promotion.delete({
      where: { id },
    });

    return { message: 'Promotion supprimée avec succès' };
  }
}
