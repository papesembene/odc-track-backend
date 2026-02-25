import { Injectable } from '@nestjs/common';
import { ImportRow } from './types/import.types';

type ImportMode = 'by_promotion' | 'by_referentiel';

/**
 * Responsabilité: valider structure + champs d'une ligne import.
 */
@Injectable()
export class ApprenantRowValidatorService {
  readonly requiredHeaders = ['nom', 'prenom', 'email', 'genre', 'adresse'];

  getMissingHeaders(headers: string[], mode: ImportMode): string[] {
    const missing = this.requiredHeaders.filter(
      (header) => !headers.includes(header),
    );

    if (
      mode === 'by_promotion' &&
      !headers.includes('referentiel') &&
      !headers.includes('referentielnom')
    ) {
      missing.push('referentiel (ou referentielNom)');
    }

    if (
      mode === 'by_referentiel' &&
      !headers.includes('promotion') &&
      !headers.includes('promotionnom')
    ) {
      missing.push('promotion (ou promotionNom)');
    }

    return missing;
  }

  validateRequiredFields(row: ImportRow, mode: ImportMode): string | null {
    const referentielName = row.referentiel || row.referentielnom;
    const promotionName = row.promotion || row.promotionnom;

    if (
      !row.nom ||
      !row.prenom ||
      !row.email ||
      !row.genre ||
      !row.adresse
    ) {
      return 'Champs obligatoires invalides (nom, prenom, email, genre, adresse)';
    }

    if (mode === 'by_promotion' && !referentielName) {
      return 'Colonne referentiel obligatoire pour cet import';
    }

    if (mode === 'by_referentiel' && !promotionName) {
      return 'Colonne promotion obligatoire pour cet import';
    }

    return null;
  }
}
