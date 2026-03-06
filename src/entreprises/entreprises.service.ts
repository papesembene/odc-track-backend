import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  buildPaginationMeta,
  normalizePagination,
} from 'src/common/helpers/pagination.helper';
import { CreateEntrepriseDto } from './dto/create-entreprise.dto';
import { UpdateEntrepriseDto } from './dto/update-entreprise.dto';
import { EntreprisesQueryDto } from './dto/entreprises-query.dto';
import { ENTREPRISES_ERRORS } from 'src/common/constants/error-messages.constant';

@Injectable()
export class EntreprisesService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly entrepriseSelect = {
    id: true,
    nom: true,
    secteur: true,
    adresse: true,
    telephone: true,
    email: true,
    createdAt: true,
    updatedAt: true,
  } as const;

  async create(dto: CreateEntrepriseDto) {
    return this.prisma.entreprise.create({ data: dto });
  }

  async findAll(query: EntreprisesQueryDto) {
    const { page, limit, skip } = normalizePagination(query);
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';

    const where: Prisma.EntrepriseWhereInput = {
      ...(query.secteur
        ? { secteur: { contains: query.secteur, mode: 'insensitive' } }
        : {}),
      ...(query.search
        ? {
            OR: [
              { nom: { contains: query.search, mode: 'insensitive' } },
              { secteur: { contains: query.search, mode: 'insensitive' } },
              { adresse: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.entreprise.findMany({
        where,
        skip,
        take: limit,
        // Les listes et details n'utilisent que ces colonnes.
        select: this.entrepriseSelect,
        orderBy: { [sortBy]: sortOrder },
      }),
      this.prisma.entreprise.count({ where }),
    ]);

    return {
      items,
      pagination: buildPaginationMeta(page, limit, totalItems),
    };
  }

  async findOne(id: string) {
    const item = await this.prisma.entreprise.findUnique({
      where: { id },
      select: this.entrepriseSelect,
    });
    if (!item)
      throw new NotFoundException(ENTREPRISES_ERRORS.NOT_FOUND.message);
    return item;
  }

  async update(id: string, dto: UpdateEntrepriseDto) {
    await this.findOne(id);
    return this.prisma.entreprise.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.entreprise.delete({ where: { id } });
    return { message: 'Entreprise supprimée avec succès' };
  }
}
