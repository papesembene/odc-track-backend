import { Module } from '@nestjs/common';
import { PromotionsController } from './promotions.controller';
import { PromotionsService } from './promotions.service';
import { PrismaService } from 'src/prisma/prisma.service';

@Module({
  controllers: [PromotionsController],
  providers: [PromotionsService, PrismaService],
})
export class PromotionsModule {}
