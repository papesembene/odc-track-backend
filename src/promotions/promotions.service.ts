import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';
import { PROMOTIONS_ERRORS } from 'src/common/constants/error-messages.constant';

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

  async findAll() {
    return this.prisma.promotion.findMany({
      include: {
        referentiels: {
          include: {
            referentiel: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
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
