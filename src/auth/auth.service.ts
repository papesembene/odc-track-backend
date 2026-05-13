import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from 'src/prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { ROLE } from '@prisma/client';
import { AUTH_ERROR } from 'src/common/constants/error-messages.constant';
import * as bcrypt from 'bcrypt';
import { JwtPayload } from 'src/common/types/jwt-payload.type';
import { StringValue } from 'ms';
import { ChangePasswordDto } from './dto/change-password.dto';
import { InOdcClientService } from 'src/integrations/in-odc/in-odc-client.service';

const authUserSelect = {
  id: true,
  nom: true,
  prenom: true,
  email: true,
  motDePasse: true,
  role: true,
  actif: true,
} as const;

type AuthUser = {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  motDePasse: string;
  role: ROLE;
  actif: boolean;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtservice: JwtService,
    private readonly configservice: ConfigService,
    private readonly inOdcClientService: InOdcClientService,
  ) {}

  async login(loginDto: LoginDto) {
    const normalizedLogin = {
      ...loginDto,
      email: this.normalizeEmail(loginDto.email),
    };
    const existingUser = await this.findUserByEmail(normalizedLogin.email);

    if (existingUser && existingUser.role !== ROLE.APPRENANT) {
      if (!existingUser.actif) {
        throw new UnauthorizedException(AUTH_ERROR.UNAUTHORIZED.message);
      }

      await this.validatePassword(
        normalizedLogin.password,
        existingUser.motDePasse,
      );
      const tokens = await this.generateTokens(
        existingUser.id,
        existingUser.email,
        existingUser.role,
      );
      const mustChangePassword = await this.getMustChangePassword(
        existingUser.id,
        existingUser.role,
      );

      return {
        ...tokens,
        mustChangePassword,
        user: this.formatUserResponse(existingUser),
      };
    }

    return this.loginApprenantViaInOdc(normalizedLogin);
  }

  // ─── LOGOUT ───────────────────────────────────────────────────────────────
  async logout(userId: string) {
    await this.findActiveUserById(userId);
    return { message: 'Déconnexion réussie' };
  }

  private async findActiveUserByemail(email: string): Promise<AuthUser> {
    // On ne charge que les champs utiles au login pour limiter le payload DB.
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: authUserSelect,
    });
    if (!user || !user.actif) {
      throw new UnauthorizedException(AUTH_ERROR.UNAUTHORIZED.message);
    }
    return user;
  }

  private async findUserByEmail(email: string): Promise<AuthUser | null> {
    return this.prisma.user.findUnique({
      where: { email },
      select: authUserSelect,
    });
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private async findActiveUserById(id: string): Promise<AuthUser> {
    // Meme principe ici: on evite de lire inutilement toute la ligne user.
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: authUserSelect,
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

  private async getMustChangePassword(
    userId: string,
    role: ROLE,
  ): Promise<boolean> {
    if (role !== ROLE.APPRENANT) {
      return false;
    }

    const apprenant = await this.prisma.apprenant.findUnique({
      where: { userId },
      select: { motDePasseTemporaire: true },
    });

    return Boolean(apprenant?.motDePasseTemporaire);
  }

  private formatUserResponse(user: AuthUser) {
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

    if (dto.ancienPassword === dto.newPassword) {
      throw new BadRequestException(
        'Le nouveau mot de passe doit être différent de l’ancien',
      );
    }

    if (user.role === ROLE.APPRENANT) {
      try {
        const auth = await this.inOdcClientService.login(
          user.email,
          dto.ancienPassword,
        );

        if (auth.user.role !== 'APPRENANT') {
          throw new UnauthorizedException(AUTH_ERROR.UNAUTHORIZED.message);
        }

        await this.inOdcClientService.changePassword(
          auth.access_token,
          dto.ancienPassword,
          dto.newPassword,
        );
        await this.updatePassword(user.id, dto.newPassword);
        await this.handleApprenantFirstLogin(userId);

        return { message: 'Mot de passe modifié avec succès' };
      } catch (error) {
        if (
          error instanceof UnauthorizedException ||
          error instanceof BadRequestException
        ) {
          throw error;
        }

        this.logger.error(
          'Echec de changement de mot de passe apprenant via in-odc',
          error instanceof Error ? error.stack : String(error),
        );
        throw new ServiceUnavailableException(
          'Le service in-odc est indisponible pour le moment',
        );
      }
    }

    await this.validatePassword(dto.ancienPassword, user.motDePasse);
    await this.updatePassword(userId, dto.newPassword);
    await this.handleApprenantFirstLogin(userId);

    return { message: 'Mot de passe modifié avec succès' };
  }

  private async loginApprenantViaInOdc(loginDto: LoginDto) {
    try {
      const auth = await this.inOdcClientService.login(
        loginDto.email,
        loginDto.password,
      );

      if (auth.user.role !== 'APPRENANT') {
        throw new UnauthorizedException(AUTH_ERROR.UNAUTHORIZED.message);
      }

      const learner = await this.inOdcClientService.getLearnerByEmail(
        loginDto.email,
        auth.access_token,
      );
      const localUser = await this.syncLearnerFromInOdc(learner, loginDto);
      const tokens = await this.generateTokens(
        localUser.id,
        localUser.email,
        localUser.role,
      );

      return {
        ...tokens,
        mustChangePassword: false,
        user: this.formatUserResponse(localUser),
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      this.logger.error(
        'Echec de connexion apprenant via in-odc',
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  private async syncLearnerFromInOdc(
    learner: Awaited<ReturnType<InOdcClientService['getLearnerByEmail']>>,
    loginDto: LoginDto,
  ) {
    if (!learner.referential) {
      throw new ServiceUnavailableException(
        'Le profil apprenant in-odc ne contient pas de référentiel exploitable',
      );
    }

    const hashedPassword = await bcrypt.hash(loginDto.password, 10);

    await this.prisma.promotion.upsert({
      where: { id: learner.promotion.id },
      update: {
        nom: learner.promotion.name,
        annee: learner.promotion.startDate
          ? new Date(learner.promotion.startDate).getFullYear()
          : new Date().getFullYear(),
        estActive: learner.promotion.status === 'ACTIVE',
      },
      create: {
        id: learner.promotion.id,
        nom: learner.promotion.name,
        annee: learner.promotion.startDate
          ? new Date(learner.promotion.startDate).getFullYear()
          : new Date().getFullYear(),
        estActive: learner.promotion.status === 'ACTIVE',
      },
    });

    await this.prisma.referentiel.upsert({
      where: { id: learner.referential.id },
      update: {
        nom: learner.referential.name,
        description: learner.referential.description ?? undefined,
      },
      create: {
        id: learner.referential.id,
        nom: learner.referential.name,
        description: learner.referential.description ?? undefined,
      },
    });

    await this.prisma.promotionReferentiel.upsert({
      where: {
        promotionId_referentielId: {
          promotionId: learner.promotion.id,
          referentielId: learner.referential.id,
        },
      },
      update: {},
      create: {
        promotionId: learner.promotion.id,
        referentielId: learner.referential.id,
      },
    });

    const user = await this.prisma.user.upsert({
      where: { email: learner.user.email },
      update: {
        nom: learner.lastName,
        prenom: learner.firstName,
        motDePasse: hashedPassword,
        role: ROLE.APPRENANT,
        actif: true,
      },
      create: {
        nom: learner.lastName,
        prenom: learner.firstName,
        email: learner.user.email,
        motDePasse: hashedPassword,
        role: ROLE.APPRENANT,
        actif: true,
      },
      select: authUserSelect,
    });

    const existingApprenant = await this.prisma.apprenant.findFirst({
      where: {
        OR: [
          { userId: user.id },
          { user: { email: learner.user.email } },
          ...(learner.phone ? [{ telephone: learner.phone }] : []),
        ],
      },
      select: { id: true },
    });

    const apprenantData = {
      userId: user.id,
      referentielId: learner.referential.id,
      promotionId: learner.promotion.id,
      telephone: learner.phone,
      dateNaissance: learner.birthDate
        ? new Date(learner.birthDate)
        : undefined,
      genre:
        learner.gender === 'MALE'
          ? 'M'
          : learner.gender === 'FEMALE'
            ? 'F'
            : 'NC',
      adresse: learner.address ?? '',
      motDePasseTemporaire: false,
      datePremiereConnexion: undefined as Date | undefined,
    };

    if (existingApprenant) {
      await this.prisma.apprenant.update({
        where: { id: existingApprenant.id },
        data: apprenantData,
      });
    } else {
      await this.prisma.apprenant.create({
        data: {
          id: learner.id,
          ...apprenantData,
          datePremiereConnexion: new Date(),
        },
      });
    }

    return user;
  }
}
