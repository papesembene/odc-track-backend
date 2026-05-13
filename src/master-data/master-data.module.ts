import { Module } from '@nestjs/common';
import { InOdcModule } from 'src/integrations/in-odc/in-odc.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { MasterDataController } from './master-data.controller';
import { MasterDataSyncService } from './master-data-sync.service';

@Module({
  imports: [PrismaModule, InOdcModule],
  controllers: [MasterDataController],
  providers: [MasterDataSyncService],
  exports: [MasterDataSyncService],
})
export class MasterDataModule {}
