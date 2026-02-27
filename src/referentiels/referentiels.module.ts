import { Module } from '@nestjs/common';
import { ReferentielsController } from './referentiels.controller';
import { ReferentielsService } from './referentiels.service';

@Module({
  controllers: [ReferentielsController],
  providers: [ReferentielsService],
})
export class ReferentielsModule {}
