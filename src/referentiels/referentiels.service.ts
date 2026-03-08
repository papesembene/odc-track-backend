import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateReferentielDto } from './dto/create-referentiel.dto';
import { UpdateReferentielDto } from './dto/update-referentiel.dto';
import { REFERENTIELS_ERRORS } from 'src/common/constants/error-messages.constant';
import { ReferentielsQueryDto } from './dto/referentiels-query.dto';
import {
  buildPaginationMeta,
  normalizePagination,
} from 'src/common/helpers/pagination.helper';

@Injectable()
export class ReferentielsService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly referentielSelect = {
    id: true,
    nom: true,
    description: true,
    createdAt: true,
    updatedAt: true,
  } as const;

  async create(dto: CreateReferentielDto) {
    return this.prisma.referentiel.create({ data: dto });
  }

  async findAll(query: ReferentielsQueryDto) {
    const { page, limit, skip } = normalizePagination(query);
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';

    const where: Prisma.ReferentielWhereInput = query.search
      ? {
          OR: [
            { nom: { contains: query.search, mode: 'insensitive' } },
            { description: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {};

    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.referentiel.findMany({
        where,
        skip,
        take: limit,
        // Selection stricte pour les listes et formulaires.
        select: this.referentielSelect,
        orderBy: { [sortBy]: sortOrder },
      }),
      this.prisma.referentiel.count({ where }),
    ]);

    return {
      items,
      pagination: buildPaginationMeta(page, limit, totalItems),
    };
  }

  async findOne(id: string) {
    const item = await this.prisma.referentiel.findUnique({
      where: { id },
      select: this.referentielSelect,
    });
    if (!item)
      throw new NotFoundException(REFERENTIELS_ERRORS.NOT_FOUND.message);
    return item;
  }

  async update(id: string, dto: UpdateReferentielDto) {
    await this.findOne(id);
    return this.prisma.referentiel.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.referentiel.delete({ where: { id } });
    return { message: 'Référentiel supprimé avec succès' };
  }
}
