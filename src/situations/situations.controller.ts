import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ROLE } from '@prisma/client';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { ResponseHelper } from 'src/common/helpers/response.helper';
import { SituationsService } from './situations.service';
import { CreateSituationDto } from './dto/create-situation.dto';
import { UpdateSituationDto } from './dto/update-situation.dto';
import { ValidateSituationDto } from './dto/validate-situation.dto';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class SituationsController {
  constructor(private readonly service: SituationsService) {}

  /**
   * Liste des situations d'un apprenant (POLE_EMPLOI, MANAGER, COACH).
   */
  @Get('/apprenants/:apprenantId/situations')
  @Roles(ROLE.POLE_EMPLOI, ROLE.MANAGER, ROLE.COACH)
  async findByApprenant(@Param('apprenantId') apprenantId: string) {
    const data = await this.service.findByApprenant(apprenantId);
    return ResponseHelper.success(data);
  }

  /**
   * Détail d'une situation.
   */
  @Get('/situations/:id')
  @Roles(ROLE.POLE_EMPLOI, ROLE.MANAGER, ROLE.COACH, ROLE.APPRENANT)
  async findOne(
    @Param('id') id: string,
    @Req() req: Request & { user: { id: string; role: ROLE } },
  ) {
    const data = await this.service.findOneWithAccessControl(
      id,
      req.user.id,
      req.user.role,
    );
    return ResponseHelper.success(data);
  }

  /**
   * Déclarer sa situation (APPRENANT).
   */
  @Post('/apprenants/me/situations')
  @Roles(ROLE.APPRENANT)
  @HttpCode(HttpStatus.CREATED)
  async declareMySituation(
    @Req() req: Request & { user: { id: string } },
    @Body() dto: CreateSituationDto,
  ) {
    const data = await this.service.createForMe(req.user.id, dto);
    return ResponseHelper.success(data, 'Situation déclarée avec succès');
  }

  /**
   * Modifier sa situation (APPRENANT).
   */
  @Put('/situations/:id')
  @Roles(ROLE.APPRENANT)
  async updateMySituation(
    @Req() req: Request & { user: { id: string } },
    @Param('id') id: string,
    @Body() dto: UpdateSituationDto,
  ) {
    const data = await this.service.updateForMe(req.user.id, id, dto);
    return ResponseHelper.success(data, 'Situation modifiée avec succès');
  }

  /**
   * Valider une situation (POLE_EMPLOI uniquement).
   */
  @Patch('/situations/:id/validation')
  @Roles(ROLE.POLE_EMPLOI)
  async validateSituation(
    @Param('id') id: string,
    @Body() dto: ValidateSituationDto,
  ) {
    const data = await this.service.validateSituation(id, dto);
    return ResponseHelper.success(data, 'Situation validée avec succès');
  }
}
