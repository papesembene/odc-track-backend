import { Module } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { StatistiquesController } from './statistiques.controller';
import { StatistiquesService } from './statistiques.service';

@Module({
  controllers: [StatistiquesController],
  providers: [StatistiquesService, PrismaService],
})
export class StatistiquesModule {}
