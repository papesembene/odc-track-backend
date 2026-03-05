import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, ROLE } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from 'src/prisma/prisma.service';
import { CsvParserService } from './csv-parser.service';
import { DateParserService } from './date-parser.service';
import { ApprenantRowValidatorService } from './apprenant-row-validator.service';
import { ImportResult, ImportRow, RowError } from './types/import.types';

/**
 * Responsabilité: orchestrer l'import (parse -> validation -> persistence).
 */
@Injectable()
export class ApprenantsImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly csvParser: CsvParserService,
    private readonly dateParser: DateParserService,
    private readonly rowValidator: ApprenantRowValidatorService,
  ) {}

  async importCsv(content: string, promotionId: string): Promise<ImportResult> {
    const { headers, rows } = this.csvParser.parse(content);
    return this.importRows(headers, rows, promotionId);
  }

  async importRows(
    headers: string[],
    rows: ImportRow[],
    promotionId: string,
  ): Promise<ImportResult> {
    const promotion = await this.prisma.promotion.findUnique({
      where: { id: promotionId },
    });
    if (!promotion) {
      throw new BadRequestException('Promotion introuvable');
    }

    const missingHeaders = this.rowValidator.getMissingHeaders(
      headers,
      'by_promotion',
    );
    if (missingHeaders.length > 0) {
      throw new BadRequestException(
        `Colonnes manquantes: ${missingHeaders.join(', ')}`,
      );
    }

    const hashedPassword = await bcrypt.hash('Odc@1234', 10);
    const errors: RowError[] = [];
    let createdCount = 0;

    for (let i = 0; i < rows.length; i += 1) {
      const lineNumber = i + 2;
      const row = rows[i];
      const rowError = await this.processRow(
        row,
        lineNumber,
        hashedPassword,
        promotion.id,
      );

      if (rowError) {
        errors.push(rowError);
      } else {
        createdCount += 1;
      }
    }

    return {
      totalRows: rows.length,
      createdCount,
      failedCount: errors.length,
      errors,
    };
  }

  async importCsvByReferentiel(
    content: string,
    referentielId: string,
  ): Promise<ImportResult> {
    const { headers, rows } = this.csvParser.parse(content);
    return this.importRowsByReferentiel(headers, rows, referentielId);
  }

  async importRowsByReferentiel(
    headers: string[],
    rows: ImportRow[],
    referentielId: string,
  ): Promise<ImportResult> {
    const referentiel = await this.prisma.referentiel.findUnique({
      where: { id: referentielId },
    });
    if (!referentiel) {
      throw new BadRequestException('Referentiel introuvable');
    }

    const missingHeaders = this.rowValidator.getMissingHeaders(
      headers,
      'by_referentiel',
    );
    if (missingHeaders.length > 0) {
      throw new BadRequestException(
        `Colonnes manquantes: ${missingHeaders.join(', ')}`,
      );
    }

    const hashedPassword = await bcrypt.hash('Odc@1234', 10);
    const errors: RowError[] = [];
    let createdCount = 0;

    for (let i = 0; i < rows.length; i += 1) {
      const lineNumber = i + 2;
      const row = rows[i];
      const rowError = await this.processRowByReferentiel(
        row,
        lineNumber,
        hashedPassword,
        referentiel.id,
      );

      if (rowError) {
        errors.push(rowError);
      } else {
        createdCount += 1;
      }
    }

    return {
      totalRows: rows.length,
      createdCount,
      failedCount: errors.length,
      errors,
    };
  }

  /**
   * Traite une ligne CSV pour import PAR PROMOTION
   * (Ne nécessite PAS de colonne referentiel dans le fichier)
   */
  private async processRow(
    row: Record<string, string>,
    lineNumber: number,
    hashedPassword: string,
    promotionId: string,
  ): Promise<RowError | null> {
    const requiredError = this.rowValidator.validateRequiredFields(
      row,
      'by_promotion',
    );
    if (requiredError) return { line: lineNumber, message: requiredError };

    const email = row.email.toLowerCase();

    // Pour l'import par promotion, on utilise le premier référentiel associé à la promotion
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      return { line: lineNumber, message: 'Email deja utilise' };
    }

    const dateNaissance = this.dateParser.parseFlexibleDate(row.datenaissance);
    if (row.datenaissance && !dateNaissance) {
      return {
        line: lineNumber,
        message:
          'dateNaissance invalide (formats: JJ/MM/AAAA, J/M/AA, YYYY-MM-DD, DD-MM-YYYY)',
      };
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            nom: row.nom,
            prenom: row.prenom,
            email,
            motDePasse: hashedPassword,
            role: ROLE.APPRENANT,
          },
        });

        // Trouver un référentiel par défaut pour cette promotion
        const promotionReferentiels = await tx.promotionReferentiel.findMany({
          where: { promotionId },
          include: { referentiel: true },
          take: 1,
        });

        if (promotionReferentiels.length === 0) {
          throw new Error('Aucun referentiel associe a la promotion');
        }

        const defaultReferentiel = promotionReferentiels[0];

        const apprenantData = {
          userId: user.id,
          referentielId: defaultReferentiel.referentielId,
          promotionId,
          telephone: row.telephone || null,
          dateNaissance,
          genre: row.genre,
          adresse: row.adresse,
        } as unknown as Prisma.ApprenantUncheckedCreateInput;

        await tx.apprenant.create({
          data: apprenantData,
        });
      });

      return null;
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        error.message === 'Aucun referentiel associe a la promotion'
      ) {
        return {
          line: lineNumber,
          message: 'Aucun referentiel associe a la promotion',
        };
      }

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          return {
            line: lineNumber,
            message: 'Conflit d unicite (email ou relation deja existante)',
          };
        }

        if (error.code === 'P2003') {
          return {
            line: lineNumber,
            message: 'Contrainte de cle etrangere invalide',
          };
        }
      }

      return {
        line: lineNumber,
        message: 'Erreur technique pendant la creation',
      };
    }
  }

  /**
   * Traite une ligne CSV pour import PAR REFERENTIEL
   * (Ne nécessite PAS de colonne promotion dans le fichier)
   */
  private async processRowByReferentiel(
    row: Record<string, string>,
    lineNumber: number,
    hashedPassword: string,
    referentielId: string,
  ): Promise<RowError | null> {
    const requiredError = this.rowValidator.validateRequiredFields(
      row,
      'by_referentiel',
    );
    if (requiredError) return { line: lineNumber, message: requiredError };

    const email = row.email.toLowerCase();

    // Pour l'import par référentiel, on utilise la première promotion associée au référentiel
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      return { line: lineNumber, message: 'Email deja utilise' };
    }

    const dateNaissance = this.dateParser.parseFlexibleDate(row.datenaissance);
    if (row.datenaissance && !dateNaissance) {
      return {
        line: lineNumber,
        message:
          'dateNaissance invalide (formats: JJ/MM/AAAA, J/M/AA, YYYY-MM-DD, DD-MM-YYYY)',
      };
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            nom: row.nom,
            prenom: row.prenom,
            email,
            motDePasse: hashedPassword,
            role: ROLE.APPRENANT,
          },
        });

        // Trouver une promotion par défaut pour ce référentiel
        const referentielPromotions = await tx.promotionReferentiel.findMany({
          where: { referentielId },
          include: { promotion: true },
          take: 1,
        });

        if (referentielPromotions.length === 0) {
          throw new Error('Aucune promotion associee au referentiel');
        }

        const defaultPromotion = referentielPromotions[0];

        const apprenantData = {
          userId: user.id,
          referentielId,
          promotionId: defaultPromotion.promotionId,
          telephone: row.telephone || null,
          dateNaissance,
          genre: row.genre,
          adresse: row.adresse,
        } as unknown as Prisma.ApprenantUncheckedCreateInput;

        await tx.apprenant.create({
          data: apprenantData,
        });
      });

      return null;
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        error.message === 'Aucune promotion associee au referentiel'
      ) {
        return {
          line: lineNumber,
          message: 'Aucune promotion associee au referentiel',
        };
      }

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          return {
            line: lineNumber,
            message: 'Conflit d unicite (email ou relation deja existante)',
          };
        }

        if (error.code === 'P2003') {
          return {
            line: lineNumber,
            message: 'Contrainte de cle etrangere invalide',
          };
        }
      }

      return {
        line: lineNumber,
        message: 'Erreur technique pendant la creation',
      };
    }
  }
}
