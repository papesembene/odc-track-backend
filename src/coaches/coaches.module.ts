import { Module } from '@nestjs/common';
import { MasterDataModule } from 'src/master-data/master-data.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { CoachesController } from './coaches.controller';
import { CoachesService } from './coaches.service';

@Module({
  imports: [PrismaModule, MasterDataModule],
  controllers: [CoachesController],
  providers: [CoachesService],
  exports: [],
})
export class CoachesModule {}
