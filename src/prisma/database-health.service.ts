import { Injectable } from '@nestjs/common';
/**
 * Ce service sert juste à mémoriser :

si la base est joignable
la dernière erreur connue
 */
@Injectable()
export class DatabaseHealthService {
  private dbAvailable = false;
  private lastError: string | null = null;

  isAvailable() {
    return this.dbAvailable;
  }

  getLastError() {
    return this.lastError;
  }

  markAvailable() {
    this.dbAvailable = true;
    this.lastError = null;
  }

  markUnavailable(error?: unknown) {
    this.dbAvailable = false;
    this.lastError =
      error instanceof Error ? error.message : 'Database unavailable';
  }
}
