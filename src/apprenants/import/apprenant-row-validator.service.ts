import { Injectable } from '@nestjs/common';
import { ImportRow } from './types/import.types';

type ImportMode = 'by_promotion' | 'by_referentiel';

/**
 * Responsabilité: valider structure + champs d'une ligne import.
 */
@Injectable()
export class ApprenantRowValidatorService {
  readonly requiredHeaders = ['nom', 'prenom', 'email', 'genre', 'adresse'];

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getMissingHeaders(headers: string[], _mode: ImportMode): string[] {
    const missing = this.requiredHeaders.filter(
      (header) => !headers.includes(header),
    );

    // Plus besoin de colonnes promotion/referentiel dans le fichier
    // car l'utilisateur les sélectionne déjà dans l'interface

    return missing;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  validateRequiredFields(row: ImportRow, _mode: ImportMode): string | null {
    // Les champs obligatoires
    if (!row.nom || !row.prenom || !row.email || !row.genre || !row.adresse) {
      return 'Champs obligatoires invalides (nom, prenom, email, genre, adresse)';
    }

    // Plus besoin de vérifier promotion/referentiel dans le fichier
    // car l'utilisateur les sélectionne déjà dans l'interface

    return null;
  }
}
