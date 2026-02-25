import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { RolesGuard } from './guards/roles.guard';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_EXPIRES_IN'),
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [
    /**
     * JwtStrategy vérifie l'accessToken sur chaque requête protégée
     * JwtRefreshStrategy vérifie le refreshToken sur la route refresh
     * RolesGuard vérifie les rôles sur les routes annotées @Roles()
     */
    JwtStrategy,
    JwtRefreshStrategy,
    RolesGuard,
    AuthService,
  ],
  exports: [JwtModule, PassportModule, RolesGuard],
  controllers: [AuthController],
})
export class AuthModule {}
