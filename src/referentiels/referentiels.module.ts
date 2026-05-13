import { Module } from '@nestjs/common';
import { MasterDataModule } from 'src/master-data/master-data.module';
import { ReferentielsController } from './referentiels.controller';
import { ReferentielsService } from './referentiels.service';

@Module({
  imports: [MasterDataModule],
  controllers: [ReferentielsController],
  providers: [ReferentielsService],
})
export class ReferentielsModule {}
