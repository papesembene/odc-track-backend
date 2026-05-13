import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { ROLE } from '@prisma/client';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { ResponseHelper } from 'src/common/helpers/response.helper';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { PromotionsQueryDto } from './dto/promotions-query.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';
import { PromotionsService } from './promotions.service';

@Controller('promotions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
export class PromotionsController {
  constructor(private readonly service: PromotionsService) {}

  @Post()
  @Roles(ROLE.ADMIN, ROLE.MANAGER)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreatePromotionDto) {
    const data = this.service.create(dto);
    return ResponseHelper.success(data, 'Promotion créée avec succès');
  }

  @Get()
  async findAll(@Query() query: PromotionsQueryDto) {
    const data = await this.service.findAll(query);
    return ResponseHelper.success(data);
  }

  @Get('master-data')
  async findAllMasterData(@Query() query: PromotionsQueryDto): Promise<{
    success: boolean;
    message: string;
    data: Awaited<ReturnType<PromotionsService['findAllFromInOdc']>>;
    timeStamp: string;
  }> {
    const data = await this.service.findAllFromInOdc(query);
    return ResponseHelper.success(data);
  }

  @Get('master-data/active')
  async getActiveMasterData() {
    const data = await this.service.getActiveFromInOdc();
    return ResponseHelper.success(data);
  }

  /**
   * GET /api/v1/promotions/active
   * Récupère la promotion active (si aucune n'est active, retourne null)
   * NOTE: Doit être défini AVANT :id pour éviter que "active" soit interprété comme un id
   */
  @Get('active')
  async getActive() {
    const data = await this.service.getActive();
    return ResponseHelper.success(data);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const data = await this.service.findOne(id);
    return ResponseHelper.success(data);
  }

  @Put(':id')
  @Roles(ROLE.ADMIN, ROLE.MANAGER)
  update(@Param('id') id: string, @Body() dto: UpdatePromotionDto) {
    const data = this.service.update(id, dto);
    return ResponseHelper.success(data, 'Promotion modifiée avec succès');
  }

  @Delete(':id')
  @Roles(ROLE.ADMIN, ROLE.MANAGER)
  remove(@Param('id') id: string) {
    const data = this.service.remove(id);
    return ResponseHelper.success(data);
  }

  /**
   * POST /api/v1/promotions/:id/activate
   * Active une promotion (désactive automatiquement les autres)
   */
  @Post(':id/activate')
  @Roles(ROLE.MANAGER, ROLE.ADMIN)
  setActive(@Param('id') id: string) {
    const data = this.service.setActive(id);
    return ResponseHelper.success(data, 'Promotion activée avec succès');
  }
}
