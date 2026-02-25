import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateReferentielDto } from './dto/create-referentiel.dto';
import { UpdateReferentielDto } from './dto/update-referentiel.dto';
import { REFERENTIELS_ERRORS } from 'src/common/constants/error-messages.constant';

@Injectable()
export class ReferentielsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateReferentielDto) {
    return this.prisma.referentiel.create({ data: dto });
  }

  async findAll() {
    return this.prisma.referentiel.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string) {
    const item = await this.prisma.referentiel.findUnique({ where: { id } });
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
