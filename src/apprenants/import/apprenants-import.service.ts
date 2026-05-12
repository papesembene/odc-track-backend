import { BadRequestException, Injectable } from '@nestjs/common';
import { DOCTYPE, Prisma, ROLE, STATUT } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { Workbook } from 'exceljs';
import { InOdcClientService } from 'src/integrations/in-odc/in-odc-client.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { CsvParserService } from './csv-parser.service';
import { DateParserService } from './date-parser.service';
import { ApprenantRowValidatorService } from './apprenant-row-validator.service';
import {
  CreatedHistoricalAccount,
  ImportResult,
  ImportRow,
  RowError,
} from './types/import.types';

/**
 * Responsabilité: orchestrer l'import (parse -> validation -> persistence).
 */
@Injectable()
export class ApprenantsImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inOdcClientService: InOdcClientService,
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

    await this.ensurePromotionIsHistorical(promotion.nom);

    const missingHeaders = this.rowValidator.getMissingHeaders(
      headers,
      'by_promotion',
    );
    if (missingHeaders.length > 0) {
      throw new BadRequestException(
        `Colonnes manquantes: ${missingHeaders.join(', ')}`,
      );
    }

    const errors: RowError[] = [];
    let createdCount = 0;

    for (let i = 0; i < rows.length; i += 1) {
      const lineNumber = i + 2;
      const row = rows[i];
      const rowError = await this.processRow(
        row,
        lineNumber,
        'Odc@1234',
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

    await this.ensureReferentialExistsInMasterData(referentiel.nom);

    const missingHeaders = this.rowValidator.getMissingHeaders(
      headers,
      'by_referentiel',
    );
    if (missingHeaders.length > 0) {
      throw new BadRequestException(
        `Colonnes manquantes: ${missingHeaders.join(', ')}`,
      );
    }

    const errors: RowError[] = [];
    let createdCount = 0;

    for (let i = 0; i < rows.length; i += 1) {
      const lineNumber = i + 2;
      const row = rows[i];
      const rowError = await this.processRowByReferentiel(
        row,
        lineNumber,
        'Odc@1234',
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

  async importHistoricalCsv(
    content: string,
    promotionName: string,
    referentialName: string,
  ): Promise<ImportResult> {
    const { headers, rows } = this.csvParser.parse(content);
    return this.importHistoricalRows(
      headers,
      rows,
      promotionName,
      referentialName,
    );
  }

  async importHistoricalRows(
    headers: string[],
    rows: ImportRow[],
    promotionName: string,
    referentialName: string,
  ): Promise<ImportResult> {
    const missingHeaders =
      this.rowValidator.getMissingHistoricalHeaders(headers);
    if (missingHeaders.length > 0) {
      throw new BadRequestException(
        `Colonnes manquantes: ${missingHeaders.join(', ')}`,
      );
    }

    const normalizedPromotionName = this.normalizeDisplayText(promotionName);
    const normalizedReferentialName =
      this.normalizeDisplayText(referentialName);

    if (!normalizedPromotionName) {
      throw new BadRequestException('Nom de promotion historique requis');
    }

    if (!normalizedReferentialName) {
      throw new BadRequestException('Nom de referentiel requis');
    }

    await this.ensurePromotionIsHistorical(normalizedPromotionName);
    await this.ensureReferentialExistsInMasterData(normalizedReferentialName);

    const errors: RowError[] = [];
    const createdPromotionNames = new Set<string>();
    const createdReferentialNames = new Set<string>();
    const createdAccounts: CreatedHistoricalAccount[] = [];
    let createdCount = 0;
    let createdSituations = 0;

    const seenEmails = new Set<string>();
    const seenPhones = new Set<string>();
    const seenMatricules = new Set<string>();

    for (let i = 0; i < rows.length; i += 1) {
      const lineNumber = i + 2;
      const row = rows[i];

      const duplicateInFile = this.validateHistoricalDuplicateInFile(
        row,
        seenEmails,
        seenPhones,
        seenMatricules,
      );
      if (duplicateInFile) {
        errors.push({ line: lineNumber, message: duplicateInFile });
        continue;
      }

      const rowOutcome = await this.processHistoricalRow(
        row,
        lineNumber,
        normalizedPromotionName,
        normalizedReferentialName,
      );

      if ('message' in rowOutcome) {
        errors.push(rowOutcome);
        continue;
      }

      createdCount += 1;
      if (rowOutcome.createdPromotionName) {
        createdPromotionNames.add(rowOutcome.createdPromotionName);
      }
      if (rowOutcome.createdReferentialName) {
        createdReferentialNames.add(rowOutcome.createdReferentialName);
      }
      if (rowOutcome.createdSituation) {
        createdSituations += 1;
      }
      createdAccounts.push(rowOutcome.createdAccount);
    }

    return {
      totalRows: rows.length,
      createdCount,
      failedCount: errors.length,
      errors,
      createdPromotions: createdPromotionNames.size,
      createdReferentiels: createdReferentialNames.size,
      createdSituations,
      createdAccounts,
    };
  }

  async buildHistoricalTemplate() {
    const workbook = new Workbook();

    const modeleSheet = workbook.addWorksheet('modele');
    const exempleSheet = workbook.addWorksheet('exemple');
    const consignesSheet = workbook.addWorksheet('consignes');

    const headers = [
      'prenom',
      'nom',
      'telephone',
      'email',
      'matricule',
      'sexe',
      'date_naissance',
      'adresse',
      'statut_insertion',
      'entreprise',
      'poste',
      'date_embauche',
      'type_contrat',
      'commentaire',
    ];

    modeleSheet.addRow(headers);
    modeleSheet.getRow(1).font = { bold: true };
    modeleSheet.columns = headers.map((header) => ({
      header,
      key: header,
      width: Math.max(header.length + 4, 18),
    }));

    exempleSheet.addRow(headers);
    exempleSheet.addRow([
      'Fatou',
      'Diop',
      '771234567',
      'fatou.diop@email.com',
      'ODC-2023-001',
      'F',
      '2001-05-14',
      'Dakar',
      'En emploi',
      'Sonatel',
      'Developpeuse Frontend',
      '2025-01-10',
      'CDI',
      'Ancienne apprenante',
    ]);
    exempleSheet.getRow(1).font = { bold: true };
    exempleSheet.columns = headers.map((header) => ({
      header,
      key: header,
      width: Math.max(header.length + 4, 18),
    }));

    consignesSheet.addRows([
      ['Regles'],
      [
        "Ce fichier sert uniquement a l'import historique des anciennes promotions absentes de in-odc.",
      ],
      ['Colonnes obligatoires'],
      ['prenom, nom, telephone, email'],
      ['Selection avant import'],
      [
        'Choisir une seule promotion historique et un seul referentiel avant de charger le fichier.',
      ],
      ['Formats de date acceptes'],
      ['YYYY-MM-DD, JJ/MM/AAAA, JJ-MM-AAAA'],
      ['Valeurs conseillees pour sexe'],
      ['M ou F'],
      ['Valeurs conseillees pour statut_insertion'],
      ['En emploi, En stage, Projet perso, Poursuite etudes, Recherche emploi'],
      ['Important'],
      [
        "Si le nom de la promotion existe deja dans in-odc, l'import est refuse.",
      ],
    ]);
    consignesSheet.getColumn(1).width = 110;
    consignesSheet.getRow(1).font = { bold: true };
    consignesSheet.getRow(3).font = { bold: true };
    consignesSheet.getRow(5).font = { bold: true };
    consignesSheet.getRow(7).font = { bold: true };
    consignesSheet.getRow(9).font = { bold: true };
    consignesSheet.getRow(11).font = { bold: true };

    const rawBuffer = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.isBuffer(rawBuffer)
      ? rawBuffer
      : Buffer.from(rawBuffer);

    return {
      fileName: 'template-import-historique.xlsx',
      buffer,
    };
  }

  /**
   * Traite une ligne CSV pour import PAR PROMOTION
   * (Ne nécessite PAS de colonne referentiel dans le fichier)
   */
  private async processRow(
    row: Record<string, string>,
    lineNumber: number,
    temporaryPassword: string,
    promotionId: string,
  ): Promise<RowError | null> {
    const hashedPassword = await bcrypt.hash(temporaryPassword, 10);
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
    temporaryPassword: string,
    referentielId: string,
  ): Promise<RowError | null> {
    const hashedPassword = await bcrypt.hash(temporaryPassword, 10);
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

  private async processHistoricalRow(
    row: Record<string, string>,
    lineNumber: number,
    promotionName: string,
    referentialName: string,
  ): Promise<
    | RowError
    | {
        createdPromotionName?: string;
        createdReferentialName?: string;
        createdSituation: boolean;
        createdAccount: CreatedHistoricalAccount;
      }
  > {
    const requiredError =
      this.rowValidator.validateHistoricalRequiredFields(row);
    if (requiredError) {
      return { line: lineNumber, message: requiredError };
    }

    const email = row.email.trim().toLowerCase();
    const telephone = this.normalizePhone(row.telephone);
    const address = this.normalizeDisplayText(row.adresse) ?? 'Non renseignee';
    const gender = this.normalizeGender(row.sexe || row.genre);

    if (!this.isValidEmail(email)) {
      return { line: lineNumber, message: 'Email invalide' };
    }

    if (!telephone) {
      return { line: lineNumber, message: 'Telephone invalide' };
    }

    const dateNaissance = this.dateParser.parseFlexibleDate(
      row.date_naissance || row.datenaissance,
    );
    if ((row.date_naissance || row.datenaissance) && !dateNaissance) {
      return {
        line: lineNumber,
        message: 'date_naissance invalide',
      };
    }

    const dateDebut = this.dateParser.parseFlexibleDate(row.date_embauche);
    if (row.date_embauche && !dateDebut) {
      return {
        line: lineNumber,
        message: 'date_embauche invalide',
      };
    }

    const status = this.normalizeStatus(row.statut_insertion);
    if (row.statut_insertion && !status) {
      return {
        line: lineNumber,
        message: 'statut_insertion invalide',
      };
    }

    try {
      const temporaryPassword = this.generateTemporaryPassword();
      const hashedPassword = await bcrypt.hash(temporaryPassword, 10);

      const outcome = await this.prisma.$transaction(async (tx) => {
        const existingUser = await tx.user.findUnique({
          where: { email },
        });
        if (existingUser) {
          throw new Error('EMAIL_ALREADY_USED');
        }

        const existingPhoneLearner = await tx.apprenant.findFirst({
          where: { telephone },
          select: { id: true },
        });
        if (existingPhoneLearner) {
          throw new Error('PHONE_ALREADY_USED');
        }

        const promotionOutcome = await this.findOrCreateHistoricalPromotion(
          tx,
          promotionName,
        );
        const referentialOutcome =
          await this.findOrCreateMasterReferentialMirror(tx, referentialName);

        await tx.promotionReferentiel.upsert({
          where: {
            promotionId_referentielId: {
              promotionId: promotionOutcome.promotion.id,
              referentielId: referentialOutcome.referentiel.id,
            },
          },
          update: {},
          create: {
            promotionId: promotionOutcome.promotion.id,
            referentielId: referentialOutcome.referentiel.id,
          },
        });

        const user = await tx.user.create({
          data: {
            nom: this.normalizeDisplayText(row.nom) ?? row.nom,
            prenom: this.normalizeDisplayText(row.prenom) ?? row.prenom,
            email,
            motDePasse: hashedPassword,
            role: ROLE.APPRENANT,
          },
        });

        const apprenant = await tx.apprenant.create({
          data: {
            userId: user.id,
            referentielId: referentialOutcome.referentiel.id,
            promotionId: promotionOutcome.promotion.id,
            telephone,
            dateNaissance,
            genre: gender,
            adresse: address,
            motDePasseTemporaire: true,
          },
        });

        const createdSituation = await this.createHistoricalSituationIfNeeded(
          tx,
          apprenant.id,
          row,
          status,
          dateDebut ?? new Date(),
        );

        return {
          createdPromotionName: promotionOutcome.created
            ? promotionOutcome.promotion.nom
            : undefined,
          createdReferentialName: referentialOutcome.created
            ? referentialOutcome.referentiel.nom
            : undefined,
          createdSituation,
          createdAccount: {
            prenom: this.normalizeDisplayText(row.prenom) ?? row.prenom,
            nom: this.normalizeDisplayText(row.nom) ?? row.nom,
            email,
            temporaryPassword,
          },
        };
      });

      return outcome;
    } catch (error: unknown) {
      if (error instanceof Error) {
        if (error.message === 'EMAIL_ALREADY_USED') {
          return { line: lineNumber, message: 'Email deja utilise' };
        }

        if (error.message === 'PHONE_ALREADY_USED') {
          return { line: lineNumber, message: 'Telephone deja utilise' };
        }
      }

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          return {
            line: lineNumber,
            message: 'Conflit d unicite detecte',
          };
        }
      }

      return {
        line: lineNumber,
        message: 'Erreur technique pendant la creation historique',
      };
    }
  }

  private validateHistoricalDuplicateInFile(
    row: ImportRow,
    seenEmails: Set<string>,
    seenPhones: Set<string>,
    seenMatricules: Set<string>,
  ): string | null {
    const email = row.email?.trim().toLowerCase();
    if (email) {
      if (seenEmails.has(email)) {
        return 'Email en doublon dans le fichier';
      }
      seenEmails.add(email);
    }

    const phone = this.normalizePhone(row.telephone);
    if (phone) {
      if (seenPhones.has(phone)) {
        return 'Telephone en doublon dans le fichier';
      }
      seenPhones.add(phone);
    }

    const matricule = this.normalizeText(row.matricule);
    if (matricule) {
      if (seenMatricules.has(matricule)) {
        return 'Matricule en doublon dans le fichier';
      }
      seenMatricules.add(matricule);
    }

    return null;
  }

  private async findOrCreateHistoricalPromotion(
    tx: Prisma.TransactionClient,
    name: string,
  ) {
    const existing = await tx.promotion.findFirst({
      where: { nom: { equals: name, mode: 'insensitive' } },
    });

    if (existing) {
      return {
        promotion: existing,
        created: false,
      };
    }

    const promotion = await tx.promotion.create({
      data: {
        nom: name,
        annee: this.extractPromotionYear(name),
        estActive: false,
      },
    });

    return {
      promotion,
      created: true,
    };
  }

  private async findOrCreateMasterReferentialMirror(
    tx: Prisma.TransactionClient,
    name: string,
  ) {
    const existing = await tx.referentiel.findFirst({
      where: { nom: { equals: name, mode: 'insensitive' } },
    });

    if (existing) {
      return {
        referentiel: existing,
        created: false,
      };
    }

    const masterReferentials = await this.inOdcClientService.getReferentials();
    const masterReferential = masterReferentials.find(
      (referential) =>
        this.normalizeText(referential.name) === this.normalizeText(name),
    );

    if (!masterReferential) {
      throw new BadRequestException(
        'Ce referentiel doit exister dans in-odc avant de pouvoir etre utilise pour un import historique.',
      );
    }

    const referentiel = await tx.referentiel.create({
      data: {
        nom: masterReferential.name,
        description:
          masterReferential.description ??
          'Referentiel synchronise depuis in-odc pour l historique',
      },
    });

    return {
      referentiel,
      created: true,
    };
  }

  private async createHistoricalSituationIfNeeded(
    tx: Prisma.TransactionClient,
    apprenantId: string,
    row: ImportRow,
    status: STATUT | null,
    dateDebut: Date,
  ) {
    if (!status) {
      return false;
    }

    const entrepriseNom = this.normalizeDisplayText(row.entreprise);
    const entrepriseEmail = this.normalizeOptionalEmail(row.email_entreprise);
    const entrepriseTelephone = this.normalizePhone(row.telephone_entreprise);
    const entrepriseAdresse = this.normalizeDisplayText(row.adresse_entreprise);
    const poste = this.normalizeDisplayText(row.poste);
    const typeContrat = this.normalizeDisplayText(row.type_contrat);
    const commentaire = [
      poste,
      typeContrat,
      this.normalizeDisplayText(row.commentaire),
    ]
      .filter(Boolean)
      .join(' | ');

    let entrepriseId: string | null = null;
    if (entrepriseNom) {
      const entreprise = await tx.entreprise.findFirst({
        where: { nom: { equals: entrepriseNom, mode: 'insensitive' } },
      });

      if (entreprise) {
        entrepriseId = entreprise.id;
      } else {
        const createdEntreprise = await tx.entreprise.create({
          data: {
            nom: entrepriseNom,
            email: entrepriseEmail,
            telephone: entrepriseTelephone,
            adresse: entrepriseAdresse,
          },
        });
        entrepriseId = createdEntreprise.id;
      }
    }

    await tx.situationProfessionnelle.create({
      data: {
        apprenantId,
        statut: status,
        dateDebut,
        commentaire: commentaire || null,
        valide: true,
        dateValidation: new Date(),
        entrepriseId,
        nomEntrepriseLibre: entrepriseId ? null : entrepriseNom,
        adresseEntrepriseLibre: entrepriseId ? null : entrepriseAdresse,
      },
    });

    if (this.normalizeDisplayText(row.cv_url)) {
      await tx.document.create({
        data: {
          type: DOCTYPE.CV,
          fichier: this.normalizeDisplayText(row.cv_url)!,
          apprenantId,
        },
      });
    }

    return true;
  }

  private async ensurePromotionIsHistorical(name: string) {
    const masterPromotions = await this.inOdcClientService.getPromotions();
    const existsInMasterData = masterPromotions.some(
      (promotion) =>
        this.normalizeText(promotion.name) === this.normalizeText(name),
    );

    if (existsInMasterData) {
      throw new BadRequestException(
        'Cette promotion est deja geree dans in-odc. Utilisez l import historique uniquement pour les anciennes promotions absentes de in-odc.',
      );
    }
  }

  private async ensureReferentialExistsInMasterData(name: string) {
    const masterReferentials = await this.inOdcClientService.getReferentials();
    const existsInMasterData = masterReferentials.some(
      (referential) =>
        this.normalizeText(referential.name) === this.normalizeText(name),
    );

    if (!existsInMasterData) {
      throw new BadRequestException(
        'Ce referentiel doit exister dans in-odc pour etre utilise dans un import historique.',
      );
    }
  }

  private extractPromotionYear(name: string) {
    const yearMatch = name.match(/(19|20)\d{2}/);
    if (yearMatch) {
      return Number(yearMatch[0]);
    }

    return new Date().getFullYear();
  }

  private generateTemporaryPassword() {
    const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lowercase = 'abcdefghijkmnopqrstuvwxyz';
    const numbers = '23456789';
    const symbols = '!@#$%';
    const allChars = `${uppercase}${lowercase}${numbers}${symbols}`;

    const pick = (chars: string) =>
      chars[Math.floor(Math.random() * chars.length)];

    const password = [
      pick(uppercase),
      pick(lowercase),
      pick(numbers),
      pick(symbols),
    ];

    while (password.length < 10) {
      password.push(pick(allChars));
    }

    return password.sort(() => Math.random() - 0.5).join('');
  }

  private normalizeStatus(raw?: string): STATUT | null {
    const value = this.normalizeText(raw);
    if (!value) {
      return null;
    }

    if (['en emploi', 'emploi', 'job'].includes(value)) {
      return STATUT.EN_EMPLOI;
    }

    if (['en stage', 'stage'].includes(value)) {
      return STATUT.EN_STAGE;
    }

    if (
      ['poursuite etudes', 'poursuite etude', 'etudes', 'etude'].includes(value)
    ) {
      return STATUT.POURSUITE_ETUDES;
    }

    if (
      ['projet perso', 'entrepreneur', 'freelance', 'auto emploi'].includes(
        value,
      )
    ) {
      return STATUT.PROJET_PERSO;
    }

    if (['recherche emploi', 'cherche emploi', 'sans emploi'].includes(value)) {
      return STATUT.RECHERCHE_EMPLOI;
    }

    return null;
  }

  private normalizeGender(raw?: string) {
    const value = this.normalizeText(raw);
    if (value === 'm' || value === 'masculin' || value === 'male') {
      return 'M';
    }

    if (value === 'f' || value === 'feminin' || value === 'female') {
      return 'F';
    }

    return 'N/A';
  }

  private normalizePhone(raw?: string) {
    const value = raw?.trim();
    if (!value) {
      return null;
    }

    return value.replace(/\s+/g, '');
  }

  private normalizeOptionalEmail(raw?: string) {
    const value = raw?.trim().toLowerCase();
    return value && this.isValidEmail(value) ? value : null;
  }

  private normalizeDisplayText(raw?: string) {
    return raw?.trim() ? raw.trim() : null;
  }

  private normalizeText(raw?: string) {
    return raw
      ?.trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  private isValidEmail(email: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
}
