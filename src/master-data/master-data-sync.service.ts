import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  InOdcClientService,
} from 'src/integrations/in-odc/in-odc-client.service';
import {
  InOdcPromotion,
  InOdcReferenceCoach,
  InOdcReferenceLearner,
  InOdcReferential,
} from 'src/integrations/in-odc/in-odc.types';
import { PrismaService } from 'src/prisma/prisma.service';

type SnapshotKey =
  | 'promotions'
  | 'referentials'
  | 'coaches'
  | 'learners';

type SnapshotRow = {
  key: string;
  payload: unknown;
  syncedAt: Date;
  updatedAt: Date;
};

@Injectable()
export class MasterDataSyncService {
  private readonly logger = new Logger(MasterDataSyncService.name);
  private readonly freshnessMsByKey: Record<SnapshotKey, number> = {
    promotions: 5 * 60 * 1000,
    referentials: 5 * 60 * 1000,
    coaches: 5 * 60 * 1000,
    learners: 10 * 60 * 1000,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly inOdcClientService: InOdcClientService,
  ) {}

  async getPromotions(options?: { forceRefresh?: boolean }) {
    return this.getSnapshot<InOdcPromotion[]>(
      'promotions',
      () => this.inOdcClientService.getPromotions(options),
      options,
    );
  }

  async getActivePromotion(options?: { forceRefresh?: boolean }) {
    const promotions = await this.getPromotions(options);
    const activePromotion =
      promotions.find((promotion) => promotion.status === 'ACTIVE') ?? null;

    if (!activePromotion) {
      throw new NotFoundException('Aucune promotion active disponible');
    }

    return activePromotion;
  }

  async getReferentials(options?: { forceRefresh?: boolean }) {
    return this.getSnapshot<InOdcReferential[]>(
      'referentials',
      () => this.inOdcClientService.getReferentials(options),
      options,
    );
  }

  async getCoaches(options?: { forceRefresh?: boolean }) {
    return this.getSnapshot<InOdcReferenceCoach[]>(
      'coaches',
      () => this.inOdcClientService.getCoaches(options),
      options,
    );
  }

  async getReferenceLearners(options?: { forceRefresh?: boolean }) {
    return this.getSnapshot<InOdcReferenceLearner[]>(
      'learners',
      () => this.inOdcClientService.getAllReferenceLearners({}, options),
      options,
    );
  }

  async syncAll() {
    const [promotions, referentials, coaches, learners] = await Promise.all([
      this.getPromotions({ forceRefresh: true }),
      this.getReferentials({ forceRefresh: true }),
      this.getCoaches({ forceRefresh: true }),
      this.getReferenceLearners({ forceRefresh: true }),
    ]);

    return {
      promotions: promotions.length,
      referentials: referentials.length,
      coaches: coaches.length,
      learners: learners.length,
    };
  }

  async getSyncStatus() {
    const snapshots = await this.prisma.$queryRawUnsafe<
      Array<Pick<SnapshotRow, 'key' | 'syncedAt' | 'updatedAt'>>
    >(
      'SELECT "key", "syncedAt", "updatedAt" FROM "MasterDataSnapshot" ORDER BY "key" ASC',
    );

    return snapshots;
  }

  private async getSnapshot<T>(
    key: SnapshotKey,
    refresh: () => Promise<T>,
    options?: { forceRefresh?: boolean },
  ): Promise<T> {
    const snapshotRows = await this.prisma.$queryRawUnsafe<SnapshotRow[]>(
      'SELECT "key", "payload", "syncedAt", "updatedAt" FROM "MasterDataSnapshot" WHERE "key" = $1 LIMIT 1',
      key,
    );
    const snapshot = snapshotRows[0];
    const freshnessMs = this.freshnessMsByKey[key];
    const isFresh =
      snapshot &&
      Date.now() - new Date(snapshot.syncedAt).getTime() < freshnessMs;

    if (snapshot && isFresh && !options?.forceRefresh) {
      return snapshot.payload as T;
    }

    try {
      const payload = await refresh();
      const now = new Date();

      await this.prisma.$executeRawUnsafe(
        `
          INSERT INTO "MasterDataSnapshot" ("key", "payload", "syncedAt", "updatedAt")
          VALUES ($1, $2::jsonb, $3, $4)
          ON CONFLICT ("key")
          DO UPDATE SET
            "payload" = EXCLUDED."payload",
            "syncedAt" = EXCLUDED."syncedAt",
            "updatedAt" = EXCLUDED."updatedAt"
        `,
        key,
        JSON.stringify(payload),
        now,
        now,
      );

      return payload;
    } catch (error) {
      if (snapshot) {
        this.logger.warn(
          `Synchronisation master data ${key} echouee, reutilisation du snapshot local`,
        );
        return snapshot.payload as T;
      }

      throw error;
    }
  }
}
