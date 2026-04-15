import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma, ROLE, STATUT } from '@prisma/client';
import { CreateSituationDto } from './dto/create-situation.dto';
import { SituationsQueryDto } from './dto/situations-query.dto';
import { UpdateSituationDto } from './dto/update-situation.dto';
import { ValidateSituationDto } from './dto/validate-situation.dto';
import { APPRENANTS_ERRORS } from 'src/common/constants/error-messages.constant';
import {
  buildPaginationMeta,
  normalizePagination,
} from 'src/common/helpers/pagination.helper';
import { DOCUMENTS_STORAGE } from 'src/common/storage/documents-storage.interface';
import type { DocumentsStorageService } from 'src/common/storage/documents-storage.interface';

@Injectable()
export class SituationsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(DOCUMENTS_STORAGE)
    private readonly documentsStorage: DocumentsStorageService,
  ) {}

  private readonly userIdentitySelect = {
    id: true,
    nom: true,
    prenom: true,
    email: true,
    role: true,
    actif: true,
  } as const;

  private readonly situationBaseInclude = {
    entreprise: true,
    apprenant: {
      include: {
        user: {
          select: this.userIdentitySelect,
        },
      },
    },
  } as const;

  private readonly pendingValidationSelect = {
    id: true,
    statut: true,
    dateDebut: true,
    dateFin: true,
    createdAt: true,
    nomEntrepriseLibre: true,
    entreprise: {
      select: {
        id: true,
        nom: true,
      },
    },
    apprenant: {
      select: {
        user: {
          select: {
            nom: true,
            prenom: true,
          },
        },
        promotion: {
          select: {
            id: true,
            nom: true,
          },
        },
        referentiel: {
          select: {
            id: true,
            nom: true,
          },
        },
      },
    },
  } as const;

  private readonly mySituationSelect = {
    id: true,
    statut: true,
    valide: true,
    dateDebut: true,
    dateFin: true,
    commentaire: true,
    nomEntrepriseLibre: true,
    secteurEntrepriseLibre: true,
    adresseEntrepriseLibre: true,
    entreprise: {
      select: {
        id: true,
        nom: true,
        secteur: true,
        adresse: true,
      },
    },
    documents: {
      select: {
        id: true,
        type: true,
        fichier: true,
        createdAt: true,
        dateUpload: true,
      },
      orderBy: { createdAt: 'desc' as const },
    },
  } as const;

  /**
   * Retourne toutes les situations d'un apprenant.
   */
  async findByApprenant(apprenantId: string, query: SituationsQueryDto) {
    await this.ensureApprenantExists(apprenantId);
    const { page, limit, skip } = normalizePagination(query);
    const sortBy = query.sortBy ?? 'dateDebut';
    const sortOrder = query.sortOrder ?? 'desc';
    const where = this.buildSituationsWhere({
      ...query,
      apprenantId,
    });

    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.situationProfessionnelle.findMany({
        where,
        skip,
        take: limit,
        include: this.situationBaseInclude,
        orderBy: { [sortBy]: sortOrder },
      }),
      this.prisma.situationProfessionnelle.count({ where }),
    ]);

    return {
      items,
      pagination: buildPaginationMeta(page, limit, totalItems),
    };
  }

  /**
   * Retourne l'historique des situations de l'apprenant connecté.
   */
  async findMySituations(userId: string, query: SituationsQueryDto) {
    const apprenant = await this.prisma.apprenant.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!apprenant) {
      throw new NotFoundException(APPRENANTS_ERRORS.NOT_FOUND.message);
    }

    const { page, limit, skip } = normalizePagination(query);
    const sortBy = query.sortBy ?? 'dateDebut';
    const sortOrder = query.sortOrder ?? 'desc';
    const where = this.buildSituationsWhere({
      ...query,
      apprenantId: apprenant.id,
    });

    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.situationProfessionnelle.findMany({
        where,
        skip,
        take: limit,
        // Cette vue sert aux ecrans apprenant/documents. On ne charge
        // que les champs effectivement affiches ou relies.
        select: this.mySituationSelect,
        orderBy: { [sortBy]: sortOrder },
      }),
      this.prisma.situationProfessionnelle.count({ where }),
    ]);

    return {
      items: await Promise.all(
        items.map(async (situation) => ({
          ...situation,
          documents: await Promise.all(
            situation.documents.map((document) =>
              this.resolveDocumentSummary(document),
            ),
          ),
        })),
      ),
      pagination: buildPaginationMeta(page, limit, totalItems),
    };
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
    if (this.requiresEntreprise(dto.statut)) {
      this.validateEntrepriseSource(
        {
          entrepriseId: dto.entrepriseId,
          nomEntrepriseLibre: dto.nomEntrepriseLibre,
        },
        false,
      );
    }

    const entrepriseFields = this.normalizeEntrepriseFields({
      entrepriseId: this.requiresEntreprise(dto.statut)
        ? dto.entrepriseId
        : undefined,
      nomEntrepriseLibre: this.requiresEntreprise(dto.statut)
        ? dto.nomEntrepriseLibre
        : undefined,
      secteurEntrepriseLibre: this.requiresEntreprise(dto.statut)
        ? dto.secteurEntrepriseLibre
        : undefined,
      adresseEntrepriseLibre: this.requiresEntreprise(dto.statut)
        ? dto.adresseEntrepriseLibre
        : undefined,
    });

    if (this.requiresDateDebut(dto.statut) && !dto.dateDebut) {
      throw new BadRequestException(
        'dateDebut est obligatoire pour ce type de situation',
      );
    }

    // Pour PROJET_PERSO et RECHERCHE_EMPLOI, on autorise une date de debut
    // absente et on prend la date du jour pour conserver la contrainte DB.
    const normalizedDateDebut = dto.dateDebut ?? new Date().toISOString();
    this.validateDates(dto.dateDebut, dto.dateFin);

    return this.prisma.situationProfessionnelle.create({
      data: {
        apprenantId: apprenant.id,
        statut: dto.statut,
        dateDebut: new Date(normalizedDateDebut),
        dateFin: dto.dateFin ? new Date(dto.dateFin) : null,
        commentaire: dto.commentaire,
        valide: false,
        dateValidation: null,
        ...entrepriseFields,
      },
      include: this.situationBaseInclude,
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
      include: this.situationBaseInclude,
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
        valide: dto.valide ?? true,
        dateValidation: dto.valide ? new Date() : null,
        ...(dto.commentaire ? { commentaire: dto.commentaire } : {}),
      },
      include: this.situationBaseInclude,
    });
  }

  /**
   * Retourne une situation par id.
   */
  private async findOne(id: string) {
    // On centralise la forme de lecture d'une situation pour eviter les
    // divergences et limiter les includes redondants dans tout le service.
    const item = await this.prisma.situationProfessionnelle.findUnique({
      where: { id },
      include: this.situationBaseInclude,
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
      select: { id: true },
    });
    if (!apprenant) throw new NotFoundException('Apprenant introuvable');
  }

  /**
   * Vérifie existence entreprise.
   */
  private async ensureEntrepriseExists(entrepriseId: string): Promise<void> {
    const entreprise = await this.prisma.entreprise.findUnique({
      where: { id: entrepriseId },
      select: { id: true },
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

  private requiresEntreprise(statut: STATUT): boolean {
    return (
      statut === STATUT.EN_STAGE ||
      statut === STATUT.EN_EMPLOI ||
      statut === STATUT.POURSUITE_ETUDES
    );
  }

  private requiresDateDebut(statut: STATUT): boolean {
    return (
      statut === STATUT.EN_STAGE ||
      statut === STATUT.EN_EMPLOI ||
      statut === STATUT.POURSUITE_ETUDES
    );
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
   * @param promotionId - filtrer par promotion (optionnel)
   */
  async findPendingValidations(
    promotionId?: string,
    query: SituationsQueryDto = {},
  ) {
    const { page, limit, skip } = normalizePagination(query);
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';
    const pendingWhere = this.buildSituationsWhere({
      ...query,
      valide: false,
        promotionId,
    });

    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.situationProfessionnelle.findMany({
        where: pendingWhere,
        skip,
        take: limit,
        // Cette liste sert a l'ecran de validation: on ne charge donc
        // que les champs affiches dans cette vue.
        select: this.pendingValidationSelect,
        orderBy: { [sortBy]: sortOrder },
      }),
      this.prisma.situationProfessionnelle.count({ where: pendingWhere }),
    ]);

    return {
      items,
      pagination: buildPaginationMeta(page, limit, totalItems),
    };
  }

  private buildSituationsWhere(query: SituationsQueryDto) {
    const where: Prisma.SituationProfessionnelleWhereInput = {
      ...(query.apprenantId ? { apprenantId: query.apprenantId } : {}),
      ...(query.entrepriseId ? { entrepriseId: query.entrepriseId } : {}),
      ...(query.statut ? { statut: query.statut } : {}),
      ...(typeof query.valide === 'boolean' ? { valide: query.valide } : {}),
      ...(query.promotionId || query.referentielId
        ? {
            apprenant: {
              ...(query.promotionId ? { promotionId: query.promotionId } : {}),
              ...(query.referentielId
                ? { referentielId: query.referentielId }
                : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              {
                apprenant: {
                  user: {
                    nom: { contains: query.search, mode: 'insensitive' },
                  },
                },
              },
              {
                apprenant: {
                  user: {
                    prenom: { contains: query.search, mode: 'insensitive' },
                  },
                },
              },
              {
                apprenant: {
                  user: {
                    email: { contains: query.search, mode: 'insensitive' },
                  },
                },
              },
            ],
          }
        : {}),
    };

    if (query.dateDebutFrom || query.dateDebutTo) {
      where.dateDebut = {
        ...(query.dateDebutFrom ? { gte: new Date(query.dateDebutFrom) } : {}),
        ...(query.dateDebutTo ? { lte: new Date(query.dateDebutTo) } : {}),
      };
    }

    return where;
  }

  private async resolveDocumentSummary<T extends { fichier: string }>(
    document: T,
  ): Promise<T> {
    return {
      ...document,
      fichier: await this.documentsStorage.resolveAccessPath(document.fichier),
    };
  }
}
