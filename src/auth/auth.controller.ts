import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ROLE } from '@prisma/client';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ResponseHelper } from 'src/common/helpers/response.helper';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { ChangePasswordDto } from './dto/change-password.dto';

/**
 * AuthController gère toutes les routes liées à l'authentification.
 * Principe SRP : ce controller ne gère QUE l'authentification.
 * Toute la logique métier est déléguée à AuthService.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /api/v1/auth/login
   * Route publique - aucun guard nécessaire
   * @HttpCode(200) car NestJS retourne 201 par défaut sur les POST
   * On retourne 200 car c'est une action de lecture (vérification credentials)
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto) {
    const data = await this.authService.login(loginDto);
    return ResponseHelper.success(data, 'Connexion réussie');
  }
  /**
   * POST /api/v1/auth/refresh-token
   * Protégée par JwtRefreshGuard qui vérifie le refreshToken
   * @Request() req contient l'utilisateur décodé par la strategy
   * Permet de renouveler l'accessToken sans se reconnecter
   */
  @Post('refresh-token')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtRefreshGuard)
  async refreshToken(
    @Req() req: Request & { user: { id: string; email: string; role: ROLE } },
  ) {
    const data = await this.authService.refreshToken({
      sub: req.user.id,
      email: req.user.email,
      role: req.user.role,
    });
    return ResponseHelper.success(data, 'Token renouvelé avec succès');
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request & { user: { id: string } }) {
    const data = await this.authService.logout(req.user.id);
    return ResponseHelper.success(data, 'Déconnexion réussie');
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @Req() req: Request & { user: { id: string } },
    @Body() ChangePasswordDto: ChangePasswordDto,
  ) {
    const data = await this.authService.changePassword(
      req.user.id,
      ChangePasswordDto,
    );
    return ResponseHelper.success(data);
  }
}
