import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { InOdcReferential } from 'src/integrations/in-odc/in-odc.types';
import { MasterDataSyncService } from 'src/master-data/master-data-sync.service';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly masterDataSyncService: MasterDataSyncService,
  ) {}

  private readonly referentielSelect = {
    id: true,
    nom: true,
    description: true,
    createdAt: true,
    updatedAt: true,
  } as const;

  create(dto: CreateReferentielDto): never {
    void dto;
    throw new ForbiddenException(
      'Les referentiels sont geres dans in-odc. La creation locale est desactivee dans Suivi insertion.',
    );
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

  async findAllFromInOdc(query: ReferentielsQueryDto) {
    const { page, limit } = normalizePagination(query);
    const normalizedReferentiels = (
      await this.masterDataSyncService.getReferentials({
        forceRefresh: true,
      })
    ).map((referential) => this.normalizeInOdcReferential(referential));

    const filteredItems = normalizedReferentiels
      .filter((referential) => {
        if (!query.search) {
          return true;
        }

        const search = query.search.toLowerCase();
        return (
          referential.nom.toLowerCase().includes(search) ||
          (referential.description ?? '').toLowerCase().includes(search)
        );
      })
      .sort((left, right) =>
        this.compareMasterReferentiels(left, right, query),
      );

    const totalItems = filteredItems.length;
    const start = (page - 1) * limit;
    const items = filteredItems.slice(start, start + limit);

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

  update(id: string, dto: UpdateReferentielDto): never {
    void id;
    void dto;
    throw new ForbiddenException(
      'Les referentiels sont geres dans in-odc. La modification locale est desactivee dans Suivi insertion.',
    );
  }

  remove(id: string): never {
    void id;
    throw new ForbiddenException(
      'Les referentiels sont geres dans in-odc. La suppression locale est desactivee dans Suivi insertion.',
    );
  }

  private normalizeInOdcReferential(referential: InOdcReferential) {
    return {
      id: referential.id,
      inOdcId: referential.id,
      nom: referential.name,
      description: referential.description ?? null,
      createdAt: referential.createdAt ?? null,
      updatedAt: referential.updatedAt ?? null,
      capacite: referential.capacity,
      numberOfSessions: referential.numberOfSessions,
      sessionLength: referential.sessionLength ?? null,
      photoUrl: referential.photoUrl ?? null,
    };
  }

  private compareMasterReferentiels(
    left: ReturnType<ReferentielsService['normalizeInOdcReferential']>,
    right: ReturnType<ReferentielsService['normalizeInOdcReferential']>,
    query: ReferentielsQueryDto,
  ) {
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';

    let comparison = 0;

    if (sortBy === 'nom') {
      comparison = left.nom.localeCompare(right.nom, 'fr', {
        sensitivity: 'base',
      });
    } else {
      comparison =
        new Date(left.createdAt ?? 0).getTime() -
        new Date(right.createdAt ?? 0).getTime();
    }

    return sortOrder === 'asc' ? comparison : comparison * -1;
  }
}
