export type ImportRow = Record<string, string>;

export type RowError = {
  line: number;
  message: string;
};

export type CreatedHistoricalAccount = {
  prenom: string;
  nom: string;
  email: string;
  temporaryPassword: string;
};

export type ImportResult = {
  totalRows: number;
  createdCount: number;
  failedCount: number;
  errors: RowError[];
  createdPromotions?: number;
  createdReferentiels?: number;
  createdSituations?: number;
  createdAccounts?: CreatedHistoricalAccount[];
  emailedAccounts?: number;
  emailFailures?: number;
};
