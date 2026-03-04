import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  PROMOTIONS_ERRORS,
  REFERENTIELS_ERRORS,
} from 'src/common/constants/error-messages.constant';
import { StatistiquesPeriodeQueryDto } from './dto/statistiques-periode-query.dto';

type ParStatut = {
  EN_EMPLOI: number;
  EN_STAGE: number;
  RECHERCHE_EMPLOI: number;
  PROJET_PERSO: number;
  POURSUITE_ETUDES: number;
};

@Injectable()
export class StatistiquesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Construit un objet par statut initialisé à 0.
   */
  private buildEmptyParStatut(): ParStatut {
    return {
      EN_EMPLOI: 0,
      EN_STAGE: 0,
      RECHERCHE_EMPLOI: 0,
      PROJET_PERSO: 0,
      POURSUITE_ETUDES: 0,
    };
  }

  /**
   * Calcule le taux d'insertion en pourcentage.
   */
  private computeTauxInsertion(
    totalApprenants: number,
    enEmploi: number,
  ): number {
    if (totalApprenants === 0) return 0;
    return Number(((enEmploi / totalApprenants) * 100).toFixed(2));
  }

  /**
   * Agrège les situations par statut pour un filtre donné.
   */
  private async aggregateParStatut(where: {
    apprenant?: { promotionId?: string; referentielId?: string };
    createdAt?: { gte?: Date; lte?: Date };
  }): Promise<ParStatut> {
    const grouped = await this.prisma.situationProfessionnelle.groupBy({
      by: ['statut'],
      _count: { _all: true },
      where,
    });

    const parStatut = this.buildEmptyParStatut();

    for (const row of grouped) {
      if (row.statut in parStatut) {
        parStatut[row.statut as keyof ParStatut] = row._count._all;
      }
    }

    return parStatut;
  }

  /**
   * Statistiques globales.
   */
  async getGlobales() {
    const totalApprenants = await this.prisma.apprenant.count();

    const parStatut = await this.aggregateParStatut({});

    const tauxInsertion = this.computeTauxInsertion(
      totalApprenants,
      parStatut.EN_EMPLOI,
    );

    return {
      totalApprenants,
      tauxInsertion,
      parStatut,
    };
  }

  /**
   * Statistiques d'une promotion.
   */
  async getByPromotion(promotionId: string) {
    const promotion = await this.prisma.promotion.findUnique({
      where: { id: promotionId },
      select: { id: true, nom: true, annee: true },
    });

    if (!promotion) {
      throw new NotFoundException(PROMOTIONS_ERRORS.NOT_FOUND.message);
    }

    const totalApprenants = await this.prisma.apprenant.count({
      where: { promotionId },
    });

    const parStatut = await this.aggregateParStatut({
      apprenant: { promotionId },
    });

    const tauxInsertion = this.computeTauxInsertion(
      totalApprenants,
      parStatut.EN_EMPLOI,
    );
    const totalSituations = await this.prisma.situationProfessionnelle.count();
    const enAttente = await this.prisma.situationProfessionnelle.count({
      where: { valide: false },
    });
    const validees = await this.prisma.situationProfessionnelle.count({
      where: { valide: true },
    });

    const situationsRecentes =
      await this.prisma.situationProfessionnelle.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          apprenant: {
            include: { user: { select: { nom: true, prenom: true } } },
          },
        },
      });
    return {
      promotion,
      totalSituations,
      enAttente,
      validees,
      totalApprenants,
      tauxInsertion,
      parStatut,
      situationsRecentes,
    };
  }

  /**
   * Statistiques d'un référentiel.
   */
  async getByReferentiel(referentielId: string) {
    const referentiel = await this.prisma.referentiel.findUnique({
      where: { id: referentielId },
      select: { id: true, nom: true },
    });

    if (!referentiel) {
      throw new NotFoundException(REFERENTIELS_ERRORS.NOT_FOUND.message);
    }

    const totalApprenants = await this.prisma.apprenant.count({
      where: { referentielId },
    });

    const parStatut = await this.aggregateParStatut({
      apprenant: { referentielId },
    });

    const tauxInsertion = this.computeTauxInsertion(
      totalApprenants,
      parStatut.EN_EMPLOI,
    );

    return {
      referentiel,
      totalApprenants,
      tauxInsertion,
      parStatut,
    };
  }

  /**
   * Statistiques sur une période (filtrage par createdAt des situations).
   */
  async getByPeriode(query: StatistiquesPeriodeQueryDto) {
    const { dateFrom, dateTo } = query;

    const from = dateFrom ? new Date(dateFrom) : undefined;
    const to = dateTo ? new Date(dateTo) : undefined;

    if (from && to && from > to) {
      throw new BadRequestException(
        'dateFrom doit etre inferieure ou egale a dateTo',
      );
    }

    const createdAt = {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {}),
    };

    const hasDateFilter = Boolean(from || to);

    const totalApprenants = await this.prisma.apprenant.count();

    const parStatut = await this.aggregateParStatut(
      hasDateFilter ? { createdAt } : {},
    );

    const tauxInsertion = this.computeTauxInsertion(
      totalApprenants,
      parStatut.EN_EMPLOI,
    );

    return {
      periode: {
        dateFrom: dateFrom ?? null,
        dateTo: dateTo ?? null,
      },
      totalApprenants,
      tauxInsertion,
      parStatut,
    };
  }
}
