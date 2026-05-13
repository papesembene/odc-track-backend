import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';

import { UsersModule } from './users/users.module';
import { HealthController } from './health.controller';

import { AuthModule } from './auth/auth.module';
import { ReferentielsService } from './referentiels/referentiels.service';
import { ReferentielsModule } from './referentiels/referentiels.module';
import { PromotionsModule } from './promotions/promotions.module';
import { ApprenantsModule } from './apprenants/apprenants.module';
import { EntreprisesModule } from './entreprises/entreprises.module';
import { SituationsModule } from './situations/situations.module';
import { DocumentsModule } from './documents/documents.module';
import { StatistiquesModule } from './statistiques/statistiques.module';
import { CoachesModule } from './coaches/coaches.module';
import { CommonModule } from './common/common.module';
import { InOdcModule } from './integrations/in-odc/in-odc.module';
import { MasterDataModule } from './master-data/master-data.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    CommonModule,
    InOdcModule,
    MasterDataModule,
    PrismaModule,

    AuthModule,
    UsersModule,
    ReferentielsModule,
    PromotionsModule,
    ApprenantsModule,
    EntreprisesModule,
    SituationsModule,
    DocumentsModule,
    StatistiquesModule,
    CoachesModule,
  ],
  controllers: [AppController, HealthController],
  providers: [AppService, ReferentielsService],
})
export class AppModule {}
