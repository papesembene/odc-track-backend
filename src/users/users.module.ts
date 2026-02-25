import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

/**
 * UsersModule gère tout ce qui concerne les utilisateurs.
 * Il importe PrismaModule pour accéder à la base de données.
 * Il importe AuthModule pour utiliser JwtAuthGuard et RolesGuard.
 */
@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [UsersController],
  providers: [UsersService],
  /**
   * On exporte UsersService pour que les autres modules
   * puissent l'utiliser si besoin
   */
  exports: [UsersService],
})
export class UsersModule {}
