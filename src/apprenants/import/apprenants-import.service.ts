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
        promotion.nom,
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
        referentiel.nom,
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
   * Traite une ligne CSV et retourne une erreur si échec.
   */
  private async processRow(
    row: Record<string, string>,
    lineNumber: number,
    hashedPassword: string,
    promotionId: string,
    promotionName: string,
  ): Promise<RowError | null> {
    const requiredError = this.rowValidator.validateRequiredFields(
      row,
      'by_promotion',
    );
    if (requiredError) return { line: lineNumber, message: requiredError };

    const email = row.email.toLowerCase();
    const referentielName = row.referentiel || row.referentielnom;

    const referentiel = await this.prisma.referentiel.findFirst({
      where: {
        nom: {
          equals: referentielName,
          mode: 'insensitive',
        },
      },
    });
    if (!referentiel) {
      return {
        line: lineNumber,
        message: `Referentiel introuvable: ${referentielName}`,
      };
    }

    const promotionReferentiel =
      await this.prisma.promotionReferentiel.findUnique({
        where: {
          promotionId_referentielId: {
            promotionId,
            referentielId: referentiel.id,
          },
        },
      });
    if (!promotionReferentiel) {
      return {
        line: lineNumber,
        message: `Referentiel ${referentielName} non associe a la promotion ${promotionName}`,
      };
    }

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

        const apprenantData = {
          userId: user.id,
          referentielId: referentiel.id,
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

  private async processRowByReferentiel(
    row: Record<string, string>,
    lineNumber: number,
    hashedPassword: string,
    referentielId: string,
    referentielName: string,
  ): Promise<RowError | null> {
    const requiredError = this.rowValidator.validateRequiredFields(
      row,
      'by_referentiel',
    );
    if (requiredError) return { line: lineNumber, message: requiredError };

    const email = row.email.toLowerCase();
    const promotionName = row.promotion || row.promotionnom;

    const promotion = await this.prisma.promotion.findFirst({
      where: {
        nom: {
          equals: promotionName,
          mode: 'insensitive',
        },
      },
    });
    if (!promotion) {
      return {
        line: lineNumber,
        message: `Promotion introuvable: ${promotionName}`,
      };
    }

    const promotionReferentiel =
      await this.prisma.promotionReferentiel.findUnique({
        where: {
          promotionId_referentielId: {
            promotionId: promotion.id,
            referentielId,
          },
        },
      });
    if (!promotionReferentiel) {
      return {
        line: lineNumber,
        message: `Promotion ${promotionName} non associee au referentiel ${referentielName}`,
      };
    }

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

        const apprenantData = {
          userId: user.id,
          referentielId,
          promotionId: promotion.id,
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
