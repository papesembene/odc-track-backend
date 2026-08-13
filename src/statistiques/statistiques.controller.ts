import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { ROLE } from '@prisma/client';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { ResponseHelper } from 'src/common/helpers/response.helper';
import { PromotionsService } from 'src/promotions/promotions.service';
import { StatistiquesGlobalesQueryDto } from './dto/statistiques-globales-query.dto';
import { StatistiquesPeriodeQueryDto } from './dto/statistiques-periode-query.dto';
import { StatistiquesService } from './statistiques.service';

@Controller('statistiques')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
export class StatistiquesController {
  constructor(
    private readonly service: StatistiquesService,
    private readonly promotionsService: PromotionsService,
  ) {}

  /**
   * Statistiques globales (ADMIN, POLE_EMPLOI, MANAGER).
   */
  @Get('globales')
  @Roles(ROLE.POLE_EMPLOI, ROLE.MANAGER)
  async globales(@Query() query: StatistiquesGlobalesQueryDto) {
    query.forceRefresh = true;
    // Par defaut, le backoffice travaille sur la promotion active.
    // Si le frontend transmet explicitement une promotion, on respecte ce choix.
    const activePromotion = query.promotionId
      ? null
      : await this.promotionsService.getActiveFromInOdc({
          forceRefresh: true,
        });
    const data = await this.service.getGlobales(
      query.promotionId ?? (activePromotion ? activePromotion.id : undefined),
      query,
    );
    return ResponseHelper.success(data);
  }

  /**
   * Statistiques d'une promotion.
   */
  @Get('promotions/:promotionId')
  @Roles(ROLE.POLE_EMPLOI, ROLE.MANAGER)
  async byPromotion(@Param('promotionId') promotionId: string) {
    const data = await this.service.getByPromotion(promotionId);
    return ResponseHelper.success(data);
  }

  /**
   * Statistiques d'un référentiel.
   */
  @Get('referentiels/:referentielId')
  @Roles(ROLE.POLE_EMPLOI, ROLE.MANAGER)
  async byReferentiel(@Param('referentielId') referentielId: string) {
    const data = await this.service.getByReferentiel(referentielId);
    return ResponseHelper.success(data);
  }

  /**
   * Statistiques par période.
   */
  @Get('periode')
  @Roles(ROLE.POLE_EMPLOI, ROLE.MANAGER)
  async byPeriode(@Query() query: StatistiquesPeriodeQueryDto) {
    const data = await this.service.getByPeriode(query);
    return ResponseHelper.success(data);
  }
}
