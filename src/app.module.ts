import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';

import { UsersModule } from './users/users.module';

import { AuthModule } from './auth/auth.module';
import { ReferentielsService } from './referentiels/referentiels.service';
import { ReferentielsModule } from './referentiels/referentiels.module';
import { PromotionsModule } from './promotions/promotions.module';
import { ApprenantsModule } from './apprenants/apprenants.module';
import { EntreprisesModule } from './entreprises/entreprises.module';
import { SituationsModule } from './situations/situations.module';
import { DocumentsModule } from './documents/documents.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,

    AuthModule,
    UsersModule,
    ReferentielsModule,
    PromotionsModule,
    ApprenantsModule,
    EntreprisesModule,
    SituationsModule,
    DocumentsModule,
  ],
  controllers: [AppController],
  providers: [AppService, ReferentielsService],
})
export class AppModule {}
