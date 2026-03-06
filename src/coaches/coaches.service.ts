import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { USER_ERRORS } from 'src/common/constants/error-messages.constant';
import * as bcrypt from 'bcrypt';
import { CreateCoachDto } from './dto/create-coach.dto';

@Injectable()
export class CoachesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Récupérer la liste de tous les coaches
   */
  async findAll() {
    const coaches = await this.prisma.user.findMany({
      where: { role: 'COACH' },
      include: {
        coach: {
          include: {
            referentiel: {
              select: {
                id: true,
                nom: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

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
      pagination: {
        page: 1,
        limit: items.length,
        totalItems: items.length,
        totalPages: 1,
      },
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
