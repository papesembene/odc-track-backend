import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ROLE } from '@prisma/client';
import { CreateSituationDto } from './dto/create-situation.dto';
import { UpdateSituationDto } from './dto/update-situation.dto';
import { ValidateSituationDto } from './dto/validate-situation.dto';
import { APPRENANTS_ERRORS } from 'src/common/constants/error-messages.constant';

@Injectable()
export class SituationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retourne toutes les situations d'un apprenant.
   */
  async findByApprenant(apprenantId: string) {
    await this.ensureApprenantExists(apprenantId);

    return this.prisma.situationProfessionnelle.findMany({
      where: { apprenantId },
      include: {
        apprenant: {
          include: {
            user: {
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
        },
        entreprise: true,
      },
      orderBy: { dateDebut: 'desc' },
    });
  }

  /**
   * Retourne une situation avec contrôle d'accès:
   * - rôles staff: accès direct
   * - apprenant: uniquement sa propre situation
   */
  async findOneWithAccessControl(id: string, userId: string, role: ROLE) {
    const situation = await this.findOne(id);

    if (role === ROLE.APPRENANT) {
      const apprenant = await this.prisma.apprenant.findUnique({
        where: { userId },
      });
      if (!apprenant || apprenant.id !== situation.apprenantId) {
        throw new ForbiddenException('Accès refusé à cette situation');
      }
    }

    return situation;
  }

  /**
   * Déclare une situation pour l'apprenant connecté.
   */
  async createForMe(userId: string, dto: CreateSituationDto) {
    const apprenant = await this.prisma.apprenant.findUnique({
      where: { userId },
    });
    if (!apprenant)
      throw new NotFoundException(APPRENANTS_ERRORS.NOT_FOUND.message);

    if (dto.entrepriseId) await this.ensureEntrepriseExists(dto.entrepriseId);
    this.validateDates(dto.dateDebut, dto.dateFin);

    return this.prisma.situationProfessionnelle.create({
      data: {
        apprenantId: apprenant.id,
        statut: dto.statut,
        dateDebut: new Date(dto.dateDebut),
        dateFin: dto.dateFin ? new Date(dto.dateFin) : null,
        commentaire: dto.commentaire,
        valide: false,
        dateValidation: null,
        entrepriseId: dto.entrepriseId ?? null,
      },
      include: {
        apprenant: {
          include: {
            user: {
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
        },
        entreprise: true,
      },
    });
  }

  /**
   * Modifie une situation appartenant à l'apprenant connecté.
   * La modification est bloquée si la situation est déjà validée.
   */
  async updateForMe(userId: string, id: string, dto: UpdateSituationDto) {
    const apprenant = await this.prisma.apprenant.findUnique({
      where: { userId },
    });
    if (!apprenant)
      throw new NotFoundException(APPRENANTS_ERRORS.NOT_FOUND.message);

    const situation = await this.findOne(id);

    if (situation.apprenantId !== apprenant.id) {
      throw new ForbiddenException('Accès refusé à cette situation');
    }

    if (situation.valide) {
      throw new BadRequestException(
        'Situation déjà validée, modification interdite',
      );
    }

    if (dto.entrepriseId) await this.ensureEntrepriseExists(dto.entrepriseId);
    if (dto.dateDebut || dto.dateFin)
      this.validateDates(dto.dateDebut, dto.dateFin);

    return this.prisma.situationProfessionnelle.update({
      where: { id },
      data: {
        ...(dto.statut ? { statut: dto.statut } : {}),
        ...(dto.dateDebut ? { dateDebut: new Date(dto.dateDebut) } : {}),
        ...(dto.dateFin ? { dateFin: new Date(dto.dateFin) } : {}),
        ...(dto.commentaire !== undefined
          ? { commentaire: dto.commentaire }
          : {}),
        ...(dto.entrepriseId !== undefined
          ? { entrepriseId: dto.entrepriseId }
          : {}),
      },
      include: {
        apprenant: {
          include: {
            user: {
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
        },
        entreprise: true,
      },
    });
  }

  /**
   * Valide une situation (POLE_EMPLOI).
   */
  async validateSituation(id: string, dto: ValidateSituationDto) {
    await this.findOne(id);

    return this.prisma.situationProfessionnelle.update({
      where: { id },
      data: {
        valide: true,
        dateValidation: new Date(),
        ...(dto.commentaire ? { commentaire: dto.commentaire } : {}),
      },
      include: {
        apprenant: {
          include: {
            user: {
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
        },
        entreprise: true,
      },
    });
  }

  /**
   * Retourne une situation par id.
   */
  private async findOne(id: string) {
    const item = await this.prisma.situationProfessionnelle.findUnique({
      where: { id },
      include: {
        apprenant: {
          include: {
            user: {
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
        },
        entreprise: true,
      },
    });

    if (!item) throw new NotFoundException('Situation introuvable');
    return item;
  }

  /**
   * Vérifie existence apprenant.
   */
  private async ensureApprenantExists(apprenantId: string): Promise<void> {
    const apprenant = await this.prisma.apprenant.findUnique({
      where: { id: apprenantId },
    });
    if (!apprenant) throw new NotFoundException('Apprenant introuvable');
  }

  /**
   * Vérifie existence entreprise.
   */
  private async ensureEntrepriseExists(entrepriseId: string): Promise<void> {
    const entreprise = await this.prisma.entreprise.findUnique({
      where: { id: entrepriseId },
    });
    if (!entreprise) throw new NotFoundException('Entreprise introuvable');
  }

  /**
   * Vérifie la cohérence dateDebut/dateFin.
   */
  private validateDates(dateDebut?: string, dateFin?: string): void {
    if (!dateDebut || !dateFin) return;

    const debut = new Date(dateDebut);
    const fin = new Date(dateFin);

    if (Number.isNaN(debut.getTime()) || Number.isNaN(fin.getTime())) {
      throw new BadRequestException('Format de date invalide');
    }

    if (fin < debut) {
      throw new BadRequestException(
        'dateFin doit être supérieure ou égale à dateDebut',
      );
    }
  }
}
