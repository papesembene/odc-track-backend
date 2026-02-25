import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from 'src/prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { ROLE, User } from '@prisma/client';
import { AUTH_ERROR } from 'src/common/constants/error-messages.constant';
import * as bcrypt from 'bcrypt';
import { JwtPayload } from 'src/common/types/jwt-payload.type';
import { StringValue } from 'ms';
import { ChangePasswordDto } from './dto/change-password.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtservice: JwtService,
    private readonly configservice: ConfigService,
  ) {}

  async login(loginDto: LoginDto) {
    const user = await this.findActiveUserByemail(loginDto.email);
    await this.validatePassword(loginDto.password, user.motDePasse);
    const tokens = await this.generateTokens(user.id, user.email, user.role);
    return {
      ...tokens,
      user: this.formatUserResponse(user),
    };
  }

  // ─── LOGOUT ───────────────────────────────────────────────────────────────
  async logout(userId: string) {
    await this.findActiveUserById(userId);
    return { message: 'Déconnexion réussie' };
  }
  private async findActiveUserByemail(email: string): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });
    if (!user || !user.actif) {
      throw new UnauthorizedException(AUTH_ERROR.UNAUTHORIZED.message);
    }
    return user;
  }

  private async findActiveUserById(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user || !user.actif) {
      throw new UnauthorizedException(AUTH_ERROR.UNAUTHORIZED.message);
    }

    return user;
  }
  private async validatePassword(
    plainPassword: string,
    hashedPassword: string,
  ): Promise<void> {
    const isvalid = await bcrypt.compare(plainPassword, hashedPassword);
    if (!isvalid) {
      throw new BadRequestException(AUTH_ERROR.INVALID_PASSWORD.message);
    }
  }
  private async updatePassword(
    userId: string,
    newPassword: string,
  ): Promise<void> {
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await this.prisma.user.update({
      where: { id: userId },
      data: { motDePasse: hashedPassword },
    });
  }

  private async generateTokens(userId: string, email: string, role: ROLE) {
    const payload: JwtPayload = { sub: userId, email, role };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtservice.signAsync(payload, {
        secret: this.configservice.getOrThrow<string>('JWT_SECRET'),
        expiresIn: this.configservice.getOrThrow<StringValue>('JWT_EXPIRES_IN'),
      }),
      this.jwtservice.signAsync(payload, {
        secret: this.configservice.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.configservice.getOrThrow<StringValue>(
          'JWT_REFRESH_EXPIRES_IN',
        ),
      }),
    ]);

    return { accessToken, refreshToken };
  }

  private async handleApprenantFirstLogin(userId: string): Promise<void> {
    const apprenant = await this.prisma.apprenant.findUnique({
      where: { userId: userId },
    });

    if (apprenant?.motDePasseTemporaire) {
      await this.prisma.apprenant.update({
        where: { userId: userId },
        data: {
          motDePasseTemporaire: false,
          datePremiereConnexion: new Date(),
        },
      });
    }
  }

  private formatUserResponse(user: User) {
    return {
      id: user.id,
      nom: user.nom,
      prenom: user.prenom,
      email: user.email,
      role: user.role,
    };
  }
  // ─── REFRESH TOKEN ────────────────────────────────────────────────────────
  async refreshToken(payload: JwtPayload) {
    return this.generateTokens(payload.sub, payload.email, payload.role);
  }

  // ─── CHANGE PASSWORD ──────────────────────────────────────────────────────
  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.findActiveUserById(userId);

    await this.validatePassword(dto.ancienPassword, user.motDePasse);
    await this.updatePassword(userId, dto.newPassword);
    await this.handleApprenantFirstLogin(userId);

    return { message: 'Mot de passe modifié avec succès' };
  }
}
