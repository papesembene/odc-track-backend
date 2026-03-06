import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import {
  PROMOTIONS_ERRORS,
  REFERENTIELS_ERRORS,
} from 'src/common/constants/error-messages.constant';
import { StatistiquesPeriodeQueryDto } from './dto/statistiques-periode-query.dto';

@Injectable()
export class StatistiquesService {
  constructor(private readonly prisma: PrismaService) {}

  // ============================================
  // OUTILS PRIVÉS
  // ============================================

  /** Compteur d'apprenants uniques en emploi */
  private async countEnEmploi(filter: {
    promotionId?: string;
    referentielId?: string;
    createdAt?: { gte?: Date; lte?: Date };
  }): Promise<number> {
    const where: Prisma.SituationProfessionnelleWhereInput = {
      statut: 'EN_EMPLOI',
    };

    if (filter.promotionId || filter.referentielId) {
      where.apprenant = {};
      if (filter.promotionId) {
        where.apprenant.promotionId = filter.promotionId;
      }
      if (filter.referentielId) {
        where.apprenant.referentielId = filter.referentielId;
      }
    }
    if (filter.createdAt) {
      where.createdAt = filter.createdAt;
    }

    const result = await this.prisma.situationProfessionnelle.findMany({
      where,
      select: { apprenantId: true },
      distinct: ['apprenantId'],
    });
    return result.length;
  }

  /** Taux d'insertion en pourcentage */
  private calcTaux(total: number, enEmploi: number): number {
    return total === 0 ? 0 : Number(((enEmploi / total) * 100).toFixed(2));
  }

  /** Stats par statut */
  private async getParStatut(filter: {
    promotionId?: string;
    referentielId?: string;
    createdAt?: { gte?: Date; lte?: Date };
  }) {
    const where: Prisma.SituationProfessionnelleWhereInput = {};

    if (filter.promotionId || filter.referentielId) {
      where.apprenant = {};
      if (filter.promotionId) {
        where.apprenant.promotionId = filter.promotionId;
      }
      if (filter.referentielId) {
        where.apprenant.referentielId = filter.referentielId;
      }
    }
    if (filter.createdAt) {
      where.createdAt = filter.createdAt;
    }

    const grouped = await this.prisma.situationProfessionnelle.groupBy({
      by: ['statut'],
      _count: { _all: true },
      where,
    });

    const parStatut = {
      EN_EMPLOI: 0,
      EN_STAGE: 0,
      RECHERCHE_EMPLOI: 0,
      PROJET_PERSO: 0,
      POURSUITE_ETUDES: 0,
    };

    for (const row of grouped) {
      if (row.statut in parStatut)
        parStatut[row.statut as keyof typeof parStatut] = row._count._all;
    }
    return parStatut;
  }

  // ============================================
  // ENDPOINTS
  // ============================================

  /** Stats globales */
  async getGlobales(promotionId?: string) {
    const filter = promotionId ? { promotionId } : {};

    const totalApprenants = promotionId
      ? await this.prisma.apprenant.count({ where: { promotionId } })
      : await this.prisma.apprenant.count();

    const parStatut = await this.getParStatut(filter);
    const enEmploi = await this.countEnEmploi(filter);
    const tauxInsertion = this.calcTaux(totalApprenants, enEmploi);

    // Build filter for situations
    const situationsWhere = promotionId
      ? { apprenant: { promotionId } }
      : {};
    
    const [totalSituations, enAttente, validees] = await Promise.all([
      this.prisma.situationProfessionnelle.count({ where: situationsWhere }),
      this.prisma.situationProfessionnelle.count({ where: { ...situationsWhere, valide: false } }),
      this.prisma.situationProfessionnelle.count({ where: { ...situationsWhere, valide: true } }),
    ]);

    const situationsRecentes =
      await this.prisma.situationProfessionnelle.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          statut: true,
          createdAt: true,
          valide: true,
          apprenant: {
            select: { user: { select: { nom: true, prenom: true } } },
          },
        },
      });

    // Stats par promotion
    const promotions = await this.prisma.promotion.findMany({
      select: { id: true, nom: true, _count: { select: { apprenants: true } } },
    });
    const parPromotion = await Promise.all(
      promotions.map(async (p) => {
        const enEmploi = await this.countEnEmploi({ promotionId: p.id });
        const total = p._count.apprenants;
        // Statut basé sur le taux d'insertion
        const taux = total > 0 ? (enEmploi / total) * 100 : 0;
        let statut = 'En cours';
        if (taux >= 100) {
          statut = 'Terminée';
        } else if (taux >= 50) {
          statut = 'En finale';
        }
        return {
          promotionId: p.id,
          promotionNom: p.nom,
          total,
          enEmploi,
          statut,
        };
      }),
    );

    // Stats par référentiel
    const referentiels = await this.prisma.referentiel.findMany({
      select: { id: true, nom: true, _count: { select: { apprenants: true } } },
    });
    const parReferentiel = await Promise.all(
      referentiels.map(async (r) => ({
        referentielId: r.id,
        referentielNom: r.nom,
        total: r._count.apprenants,
        enEmploi: await this.countEnEmploi({ referentielId: r.id }),
      })),
    );

    return {
      totalApprenants,
      totalSituations,
      enAttente,
      validees,
      tauxInsertion,
      parStatut,
      situationsRecentes,
      parPromotion,
      parReferentiel,
    };
  }

  /** Stats par promotion */
  async getByPromotion(promotionId: string) {
    const promotion = await this.prisma.promotion.findUnique({
      where: { id: promotionId },
      select: { id: true, nom: true, annee: true },
    });
    if (!promotion)
      throw new NotFoundException(PROMOTIONS_ERRORS.NOT_FOUND.message);

    const totalApprenants = await this.prisma.apprenant.count({
      where: { promotionId },
    });
    const parStatut = await this.getParStatut({ promotionId });
    const enEmploi = await this.countEnEmploi({ promotionId });

    const [totalSituations, enAttente, validees] = await Promise.all([
      this.prisma.situationProfessionnelle.count(),
      this.prisma.situationProfessionnelle.count({ where: { valide: false } }),
      this.prisma.situationProfessionnelle.count({ where: { valide: true } }),
    ]);

    const situationsRecentes =
      await this.prisma.situationProfessionnelle.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          statut: true,
          createdAt: true,
          valide: true,
          apprenant: {
            select: { user: { select: { nom: true, prenom: true } } },
          },
        },
      });

    return {
      promotion,
      totalApprenants,
      totalSituations,
      enAttente,
      validees,
      tauxInsertion: this.calcTaux(totalApprenants, enEmploi),
      parStatut,
      situationsRecentes,
    };
  }

  /** Stats par référentiel */
  async getByReferentiel(referentielId: string) {
    const referentiel = await this.prisma.referentiel.findUnique({
      where: { id: referentielId },
      select: { id: true, nom: true },
    });
    if (!referentiel)
      throw new NotFoundException(REFERENTIELS_ERRORS.NOT_FOUND.message);

    const totalApprenants = await this.prisma.apprenant.count({
      where: { referentielId },
    });
    const parStatut = await this.getParStatut({ referentielId });
    const enEmploi = await this.countEnEmploi({ referentielId });

    return {
      referentiel,
      totalApprenants,
      tauxInsertion: this.calcTaux(totalApprenants, enEmploi),
      parStatut,
    };
  }

  /** Stats par période */
  async getByPeriode(query: StatistiquesPeriodeQueryDto) {
    const { dateFrom, dateTo } = query;
    const from = dateFrom ? new Date(dateFrom) : undefined;
    const to = dateTo ? new Date(dateTo) : undefined;

    if (from && to && from > to)
      throw new BadRequestException('dateFrom doit être <= dateTo');

    const createdAt = {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {}),
    };
    const hasDateFilter = Boolean(from || to);

    const totalApprenants = await this.prisma.apprenant.count();
    const parStatut = await this.getParStatut(
      hasDateFilter ? { createdAt } : {},
    );
    const enEmploi = await this.countEnEmploi(
      hasDateFilter ? { createdAt } : {},
    );

    return {
      periode: { dateFrom: dateFrom ?? null, dateTo: dateTo ?? null },
      totalApprenants,
      tauxInsertion: this.calcTaux(totalApprenants, enEmploi),
      parStatut,
    };
  }
}
