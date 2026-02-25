import { Injectable } from '@nestjs/common';
import { ImportRow } from './types/import.types';

/**
 * Responsabilité: parser un CSV brut en headers + lignes.
 */
@Injectable()
export class CsvParserService {
  parse(content: string): { headers: string[]; rows: ImportRow[] } {
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length < 2) {
      return { headers: [], rows: [] };
    }

    const headers = this.parseLine(lines[0]).map((h) => h.trim().toLowerCase());

    const rows = lines.slice(1).map((line) => {
      const values = this.parseLine(line);
      return headers.reduce<ImportRow>((acc, header, index) => {
        acc[header] = (values[index] ?? '').trim();
        return acc;
      }, {});
    });

    return { headers, rows };
  }

  /**
   * Parse une ligne CSV (supporte les guillemets et virgules échappées).
   */
  private parseLine(line: string): string[] {
    const output: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      const next = line[i + 1];

      if (char === '"' && inQuotes && next === '"') {
        current += '"';
        i += 1;
        continue;
      }

      if (char === '"') {
        inQuotes = !inQuotes;
        continue;
      }

      if (char === ',' && !inQuotes) {
        output.push(current);
        current = '';
        continue;
      }

      current += char;
    }

    output.push(current);
    return output;
  }
}
