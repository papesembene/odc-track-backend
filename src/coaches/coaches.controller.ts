import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { ROLE } from '@prisma/client';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { ResponseHelper } from 'src/common/helpers/response.helper';
import { CoachesService } from './coaches.service';

@Controller('coaches')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
export class CoachesController {
  constructor(private readonly coachesService: CoachesService) {}

  /**
   * GET /api/v1/coaches
   * Liste des coaches
   * Accessible par MANAGER et ADMIN
   */
  @Get()
  @Roles(ROLE.MANAGER, ROLE.ADMIN)
  async findAll() {
    const data = await this.coachesService.findAll();
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
  async create(@Body() data: { nom: string; prenom: string; email: string }) {
    const coach = await this.coachesService.create(data);
    return ResponseHelper.success(coach, 'Coach créé avec succès');
  }
}
