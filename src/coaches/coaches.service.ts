import { Injectable, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { USER_ERRORS } from 'src/common/constants/error-messages.constant';
import * as bcrypt from 'bcrypt';
import { CreateCoachDto } from './dto/create-coach.dto';
import { CoachesQueryDto } from './dto/coaches-query.dto';
import {
  buildPaginationMeta,
  normalizePagination,
} from 'src/common/helpers/pagination.helper';

@Injectable()
export class CoachesService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly coachListSelect = {
    id: true,
    nom: true,
    prenom: true,
    email: true,
    role: true,
    actif: true,
    createdAt: true,
    updatedAt: true,
    coach: {
      select: {
        specialite: true,
        referentiel: {
          select: {
            id: true,
            nom: true,
          },
        },
      },
    },
  } as const;

  /**
   * Récupérer la liste de tous les coaches
   */
  async findAll(query: CoachesQueryDto) {
    const { page, limit, skip } = normalizePagination(query);
    const where: Prisma.UserWhereInput = {
      role: 'COACH',
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

    // On lit uniquement les champs affiches dans les listes manager.
    const [coaches, totalItems] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        select: this.coachListSelect,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    // Transformer pour avoir une structure plate
    const items = coaches.map((user) => ({
      id: user.id,
      nom: user.nom,
      prenom: user.prenom,
      email: user.email,
      role: user.role,
      actif: user.actif,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      referentiel: user.coach?.referentiel
        ? { id: user.coach.referentiel.id, nom: user.coach.referentiel.nom }
        : null,
      specialite: user.coach?.specialite || null,
    }));

    return {
      items,
      pagination: buildPaginationMeta(page, limit, totalItems),
    };
  }

  /**
   * Créer un nouveau coach avec assignation à un référentiel
   */
  async create(data: CreateCoachDto) {
    // Vérifier si l'email existe déjà
    const existingUser = await this.prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      throw new ConflictException(USER_ERRORS.EMAIL_EXISTS.message);
    }

    // Hasher le mot de passe par défaut
    const hashedPassword = await bcrypt.hash('Odc@1234', 10);

    // Créer l'utilisateur et le coach dans une transaction
    const result = await this.prisma.$transaction(async (prisma) => {
      // 1. Créer l'utilisateur
      const user = await prisma.user.create({
        data: {
          nom: data.nom,
          prenom: data.prenom,
          email: data.email,
          motDePasse: hashedPassword,
          role: 'COACH',
        },
      });

      // 2. Créer le coach avec les références
      const coach = await prisma.coach.create({
        data: {
          userId: user.id,
          referentielId: data.referentielId,
          specialite: data.specialite,
        },
        include: {
          referentiel: true,
          utilisateur: {
            select: {
              id: true,
              nom: true,
              prenom: true,
              email: true,
              role: true,
              actif: true,
            },
          },
        },
      });

      return coach;
    });

    return result;
  }
}
