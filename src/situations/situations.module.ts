import { Module } from '@nestjs/common';
import { SituationsService } from './situations.service';
import { SituationsController } from './situations.controller';
import { PrismaService } from 'src/prisma/prisma.service';

@Module({
  providers: [SituationsService, PrismaService],
  controllers: [SituationsController],
})
export class SituationsModule {}
