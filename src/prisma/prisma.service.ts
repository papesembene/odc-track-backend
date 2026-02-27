import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaService | undefined;
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    // On appelle super UNE SEULE FOIS
    super({ log: ['error'] });

    // Si le singleton global n'existe pas, on le crée
    if (!global.prisma) {
      global.prisma = this;
    }

    // On retourne le singleton global
    return global.prisma;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
