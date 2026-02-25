import { Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { ImportRow } from './types/import.types';

@Injectable()
export class ExcelParserService {
  parse(buffer: Buffer): { headers: string[]; rows: ImportRow[] } {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
    const firstSheetName = workbook.SheetNames[0];

    if (!firstSheetName) {
      return { headers: [], rows: [] };
    }

    const worksheet = workbook.Sheets[firstSheetName];
    const table = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(
      worksheet,
      {
        header: 1,
        raw: false,
        defval: '',
      },
    );

    if (table.length < 2) {
      return { headers: [], rows: [] };
    }

    const headers = table[0].map((value) => String(value).trim().toLowerCase());
    const rows = table.slice(1).map((row) =>
      headers.reduce<ImportRow>((acc, header, index) => {
        acc[header] = String(row[index] ?? '').trim();
        return acc;
      }, {}),
    );

    return { headers, rows };
  }
}
