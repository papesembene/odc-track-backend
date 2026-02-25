export type ImportRow = Record<string, string>;

export type RowError = {
  line: number;
  message: string;
};

export type ImportResult = {
  totalRows: number;
  createdCount: number;
  failedCount: number;
  errors: RowError[];
};
