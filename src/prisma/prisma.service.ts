import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { DatabaseHealthService } from './database-health.service';

declare global {
  var prisma: PrismaService | undefined;
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(private readonly dbHealth: DatabaseHealthService) {
    super({ log: ['error'] });

    if (!global.prisma) {
      global.prisma = this;
    }

    return global.prisma;
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.dbHealth.markAvailable();
      this.logger.log('Connexion a la base de donnees etablie');
    } catch (error) {
      // On ne fait plus planter tout Nest au boot.
      this.dbHealth.markUnavailable(error);
      this.logger.error(
        'Base de donnees indisponible au demarrage. L application reste lancee en mode degrade.',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async onModuleDestroy() {
    try {
      await this.$disconnect();
    } catch (error) {
      this.logger.error(
        'Erreur lors de la fermeture de la connexion Prisma',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
