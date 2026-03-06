import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { USER_ERRORS } from 'src/common/constants/error-messages.constant';
import * as bcrypt from 'bcrypt';

@Injectable()
export class CoachesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Récupérer la liste de tous les coaches
   */
  async findAll() {
    const coaches = await this.prisma.user.findMany({
      where: { role: 'COACH' },
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
      orderBy: { createdAt: 'desc' },
    });

    return {
      items: coaches,
      pagination: {
        page: 1,
        limit: coaches.length,
        totalItems: coaches.length,
        totalPages: 1,
      },
    };
  }

  /**
   * Créer un nouveau coach
   */
  async create(data: { nom: string; prenom: string; email: string }) {
    // Vérifier si l'email existe déjà
    const existingUser = await this.prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      throw new ConflictException(USER_ERRORS.EMAIL_EXISTS.message);
    }

    // Hasher le mot de passe par défaut
    const hashedPassword = await bcrypt.hash('Odc@1234', 10);

    return this.prisma.user.create({
      data: {
        nom: data.nom,
        prenom: data.prenom,
        email: data.email,
        motDePasse: hashedPassword,
        role: 'COACH',
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
}
