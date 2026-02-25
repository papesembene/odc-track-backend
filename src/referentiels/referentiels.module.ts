import { Module } from '@nestjs/common';
import { ReferentielsController } from './referentiels.controller';
import { ReferentielsService } from './referentiels.service';
import { PrismaService } from 'src/prisma/prisma.service';

@Module({
  controllers: [ReferentielsController],
  providers: [ReferentielsService, PrismaService],
})
export class ReferentielsModule {}
