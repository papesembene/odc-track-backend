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
   * Retourne l'historique des situations de l'apprenant connecté.
   */
  async findMySituations(userId: string) {
    const apprenant = await this.prisma.apprenant.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!apprenant) {
      throw new NotFoundException(APPRENANTS_ERRORS.NOT_FOUND.message);
    }

    return this.prisma.situationProfessionnelle.findMany({
      where: { apprenantId: apprenant.id },
      include: {
        entreprise: true,
        documents: true,
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

    if (dto.entrepriseId) {
      await this.ensureEntrepriseExists(dto.entrepriseId);
    }
    this.validateEntrepriseSource(
      {
        entrepriseId: dto.entrepriseId,
        nomEntrepriseLibre: dto.nomEntrepriseLibre,
      },
      false,
    );

    const entrepriseFields = this.normalizeEntrepriseFields({
      entrepriseId: dto.entrepriseId,
      nomEntrepriseLibre: dto.nomEntrepriseLibre,
      secteurEntrepriseLibre: dto.secteurEntrepriseLibre,
      adresseEntrepriseLibre: dto.adresseEntrepriseLibre,
    });

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
        ...entrepriseFields,
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

    if (dto.entrepriseId) {
      await this.ensureEntrepriseExists(dto.entrepriseId);
    }

    this.validateEntrepriseSource(
      {
        entrepriseId:
          dto.entrepriseId !== undefined
            ? dto.entrepriseId
            : situation.entrepriseId,
        nomEntrepriseLibre:
          dto.nomEntrepriseLibre !== undefined
            ? dto.nomEntrepriseLibre
            : situation.nomEntrepriseLibre,
      },
      true,
    );

    const entrepriseFields =
      dto.entrepriseId !== undefined ||
      dto.nomEntrepriseLibre !== undefined ||
      dto.secteurEntrepriseLibre !== undefined ||
      dto.adresseEntrepriseLibre !== undefined
        ? this.normalizeEntrepriseFields({
            entrepriseId:
              dto.entrepriseId !== undefined
                ? dto.entrepriseId
                : situation.entrepriseId,
            nomEntrepriseLibre:
              dto.nomEntrepriseLibre !== undefined
                ? dto.nomEntrepriseLibre
                : situation.nomEntrepriseLibre,
            secteurEntrepriseLibre:
              dto.secteurEntrepriseLibre !== undefined
                ? dto.secteurEntrepriseLibre
                : situation.secteurEntrepriseLibre,
            adresseEntrepriseLibre:
              dto.adresseEntrepriseLibre !== undefined
                ? dto.adresseEntrepriseLibre
                : situation.adresseEntrepriseLibre,
          })
        : {};

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
        ...entrepriseFields,
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
  /**
   * Règle métier:
   * - création: au moins une source entreprise (entrepriseId OU nomEntrepriseLibre)
   * - mise à jour: si l'utilisateur touche aux champs entreprise, on vérifie la cohérence
   */
  private validateEntrepriseSource(
    payload: {
      entrepriseId?: string | null;
      nomEntrepriseLibre?: string | null;
    },
    isUpdate = false,
  ): void {
    const hasEntrepriseId = Boolean(payload.entrepriseId);
    const hasEntrepriseLibre = Boolean(payload.nomEntrepriseLibre?.trim());

    if (!isUpdate) {
      if (!hasEntrepriseId && !hasEntrepriseLibre) {
        throw new BadRequestException(
          'Vous devez fournir soit entrepriseId soit nomEntrepriseLibre',
        );
      }
      return;
    }

    // En update, on ne force la règle que si l'utilisateur modifie ces champs.
    if (
      payload.entrepriseId !== undefined ||
      payload.nomEntrepriseLibre !== undefined
    ) {
      if (!hasEntrepriseId && !hasEntrepriseLibre) {
        throw new BadRequestException(
          'Vous devez conserver soit entrepriseId soit nomEntrepriseLibre',
        );
      }
    }
  }

  /**
   * Si entreprise interne est utilisée, on nettoie les champs entreprise libre.
   * Si entreprise libre est utilisée, on vide entrepriseId.
   */
  private normalizeEntrepriseFields(payload: {
    entrepriseId?: string | null;
    nomEntrepriseLibre?: string | null;
    secteurEntrepriseLibre?: string | null;
    adresseEntrepriseLibre?: string | null;
  }) {
    const hasEntrepriseId = Boolean(payload.entrepriseId);
    const hasEntrepriseLibre = Boolean(payload.nomEntrepriseLibre?.trim());

    if (hasEntrepriseId) {
      return {
        entrepriseId: payload.entrepriseId,
        nomEntrepriseLibre: null,
        secteurEntrepriseLibre: null,
        adresseEntrepriseLibre: null,
      };
    }

    if (hasEntrepriseLibre) {
      return {
        entrepriseId: null,
        nomEntrepriseLibre: payload.nomEntrepriseLibre?.trim() ?? null,
        secteurEntrepriseLibre: payload.secteurEntrepriseLibre ?? null,
        adresseEntrepriseLibre: payload.adresseEntrepriseLibre ?? null,
      };
    }

    return {
      entrepriseId: payload.entrepriseId ?? null,
      nomEntrepriseLibre: payload.nomEntrepriseLibre ?? null,
      secteurEntrepriseLibre: payload.secteurEntrepriseLibre ?? null,
      adresseEntrepriseLibre: payload.adresseEntrepriseLibre ?? null,
    };
  }

  /**
   * Retourne les situations en attente de validation.
   */
  async findPendingValidations() {
    return this.prisma.situationProfessionnelle.findMany({
      where: { valide: false },
      include: {
        apprenant: {
          include: {
            user: { select: { nom: true, prenom: true } },
            promotion: true,
            referentiel: true,
          },
        },
        entreprise: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
