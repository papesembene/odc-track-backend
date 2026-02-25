import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { USER_ERRORS } from '../common/constants/error-messages.constant';
import * as bcrypt from 'bcrypt';
import { UsersQueryDto } from './dto/users-query.dto';
import {
  buildPaginationMeta,
  normalizePagination,
} from 'src/common/helpers/pagination.helper';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Récupérer la liste de tous les users
   * On exclut le mot de passe de la réponse
   */
  async findAll(query: UsersQueryDto) {
    const { page, limit, skip } = normalizePagination(query);
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';

    const where: Prisma.UserWhereInput = {
      ...(typeof query.actif === 'boolean' ? { actif: query.actif } : {}),
      ...(query.role ? { role: query.role } : {}),
      ...(query.search
        ? {
            OR: [
              { nom: { contains: query.search, mode: 'insensitive' } },
              { prenom: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        select: {
          id: true,
          nom: true,
          prenom: true,
          email: true,
          role: true,
          actif: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items,
      pagination: buildPaginationMeta(page, limit, totalItems),
    };
  }

  /**
   * Récupérer un user par son id
   * Lance une exception si l'user n'existe pas
   */
  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        nom: true,
        prenom: true,
        email: true,
        role: true,
        actif: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException(USER_ERRORS.NOT_FOUND.message);
    }

    return user;
  }

  /**
   * Créer un nouvel user
   * Vérifie que l'email n'existe pas déjà
   * Hashe le mot de passe avant de sauvegarder
   * Génère un mot de passe temporaire automatiquement
   */
  async create(createUserDto: CreateUserDto) {
    await this.checkEmailExists(createUserDto.email);

    const hashedPassword = await bcrypt.hash('Odc@1234', 10);

    return this.prisma.user.create({
      data: {
        ...createUserDto,
        motDePasse: hashedPassword,
      },
      select: {
        id: true,
        nom: true,
        prenom: true,
        email: true,
        role: true,
        actif: true,
        createdAt: true,
      },
    });
  }

  /**
   * Modifier un user existant
   * Vérifie que l'user existe
   * Vérifie que le nouvel email n'est pas déjà utilisé
   */
  async update(id: string, updateUserDto: UpdateUserDto) {
    await this.findOne(id);

    if (updateUserDto.email) {
      await this.checkEmailExists(updateUserDto.email, id);
    }

    return this.prisma.user.update({
      where: { id },
      data: updateUserDto,
      select: {
        id: true,
        nom: true,
        prenom: true,
        email: true,
        role: true,
        actif: true,
        updatedAt: true,
      },
    });
  }

  /**
   * Désactiver un user (soft delete)
   * On ne supprime jamais physiquement un user
   * On passe actif à false pour garder la traçabilité
   */
  async remove(id: string) {
    await this.findOne(id);

    await this.prisma.user.update({
      where: { id },
      data: { actif: false },
    });

    return { message: 'Compte désactivé avec succès' };
  }

  /**
   * Vérifier si un email existe déjà en base
   * excludeId permet d'exclure l'user courant
   * lors d'une mise à jour
   */
  private async checkEmailExists(
    email: string,
    excludeId?: string,
  ): Promise<void> {
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser && existingUser.id !== excludeId) {
      throw new ConflictException(USER_ERRORS.EMAIL_EXISTS.message);
    }
  }
}
