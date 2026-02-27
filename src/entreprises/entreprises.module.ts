import { Module } from '@nestjs/common';
import { EntreprisesService } from './entreprises.service';
import { EntreprisesController } from './entreprises.controller';

@Module({
  providers: [EntreprisesService],
  controllers: [EntreprisesController],
})
export class EntreprisesModule {}
