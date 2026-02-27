import { Module } from '@nestjs/common';
import { SituationsService } from './situations.service';
import { SituationsController } from './situations.controller';

@Module({
  providers: [SituationsService],
  controllers: [SituationsController],
})
export class SituationsModule {}
