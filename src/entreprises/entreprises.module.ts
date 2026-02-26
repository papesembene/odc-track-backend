import { Module } from '@nestjs/common';
import { EntreprisesService } from './entreprises.service';
import { EntreprisesController } from './entreprises.controller';
import { PrismaService } from 'src/prisma/prisma.service';

@Module({
  providers: [EntreprisesService, PrismaService],
  controllers: [EntreprisesController],
})
export class EntreprisesModule {}
