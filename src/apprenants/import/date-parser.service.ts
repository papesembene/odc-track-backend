import { Injectable } from '@nestjs/common';

/**
 * Responsabilité: parser les dates (ISO + formats FR courts/longs).
 */
@Injectable()
export class DateParserService {
  parseFlexibleDate(value?: string): Date | null {
    if (!value) return null;

    const raw = value.trim();
    if (!raw) return null;

    // ISO: 2026-02-25
    const iso = new Date(raw);
    if (!Number.isNaN(iso.getTime())) return iso;

    // FR: JJ/MM/AAAA, J/M/AA, JJ-MM-AAAA, J-M-AA
    const match = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);

    if (!match) return null;

    const day = Number(match[1]);
    const month = Number(match[2]);
    let year = Number(match[3]);

    if (year < 100) {
      year += year >= 50 ? 1900 : 2000;
    }

    if (month < 1 || month > 12 || day < 1 || day > 31) return null;

    const parsed = new Date(year, month - 1, day);

    // validation stricte
    if (
      parsed.getFullYear() !== year ||
      parsed.getMonth() !== month - 1 ||
      parsed.getDate() !== day
    ) {
      return null;
    }

    return parsed;
  }
}
