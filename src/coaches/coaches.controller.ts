import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  Param,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';
import { ROLE } from '@prisma/client';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { ResponseHelper } from 'src/common/helpers/response.helper';
import { CoachesService } from './coaches.service';
import { CreateCoachDto } from './dto/create-coach.dto';
import { CoachesQueryDto } from './dto/coaches-query.dto';
import { CoachApprenantsQueryDto } from './dto/coach-apprenants-query.dto';
import { CoachScopeQueryDto } from './dto/coach-scope-query.dto';

@Controller('coaches')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
export class CoachesController {
  constructor(private readonly coachesService: CoachesService) {}

  /**
   * GET /api/v1/coaches/me/dashboard
   * Dashboard du coach connecte:
   * referentiel impose + promotion active par defaut.
   */
  @Get('me/dashboard')
  @Roles(ROLE.COACH)
  async getMyDashboard(
    @Req() req: Request & { user: { id: string } },
    @Query() query: CoachScopeQueryDto,
  ) {
    const data = await this.coachesService.getMyDashboard(req.user.id, query);
    return ResponseHelper.success(data);
  }

  /**
   * GET /api/v1/coaches/me/statistiques
   * Vue plus detaillee pour le coach, toujours limitee a son scope.
   */
  @Get('me/statistiques')
  @Roles(ROLE.COACH)
  async getMyStatistiques(
    @Req() req: Request & { user: { id: string } },
    @Query() query: CoachScopeQueryDto,
  ) {
    const data = await this.coachesService.getMyStatistiques(
      req.user.id,
      query,
    );
    return ResponseHelper.success(data);
  }

  /**
   * GET /api/v1/coaches/me/apprenants
   * Liste paginee des apprenants du referentiel du coach,
   * filtree par promotion active ou promotion choisie.
   */
  @Get('me/apprenants')
  @Roles(ROLE.COACH)
  async findMyApprenants(
    @Req() req: Request & { user: { id: string } },
    @Query() query: CoachApprenantsQueryDto,
  ) {
    const data = await this.coachesService.findMyApprenants(req.user.id, query);
    return ResponseHelper.success(data);
  }

  /**
   * GET /api/v1/coaches/me/apprenants/:id
   * Detail d'un apprenant dans le perimetre du coach.
   */
  @Get('me/apprenants/:id')
  @Roles(ROLE.COACH)
  async findMyApprenantDetail(
    @Req() req: Request & { user: { id: string } },
    @Param('id') apprenantId: string,
    @Query() query: CoachScopeQueryDto,
  ) {
    const data = await this.coachesService.findMyApprenantDetail(
      req.user.id,
      apprenantId,
      query,
    );
    return ResponseHelper.success(data);
  }

  /**
   * GET /api/v1/coaches
   * Liste des coaches
   * Accessible par MANAGER et ADMIN
   */
  @Get()
  @Roles(ROLE.MANAGER, ROLE.ADMIN)
  async findAll(@Query() query: CoachesQueryDto) {
    const data = await this.coachesService.findAll(query);
    return ResponseHelper.success(data);
  }

  /**
   * POST /api/v1/coaches
   * Créer un nouveau coach
   * Accessible par MANAGER et ADMIN
   */
  @Post()
  @Roles(ROLE.MANAGER, ROLE.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() data: CreateCoachDto) {
    const coach = await this.coachesService.create(data);
    return ResponseHelper.success(coach, 'Coach créé avec succès');
  }
}
