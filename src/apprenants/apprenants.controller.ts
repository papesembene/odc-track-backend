import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';
import { ROLE } from '@prisma/client';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { ResponseHelper } from 'src/common/helpers/response.helper';
import { PromotionsService } from 'src/promotions/promotions.service';
import { ApprenantsService } from './apprenants.service';
import { ApprenantsQueryDto } from './dto/apprenants-query.dto';
import { CreateApprenantDto } from './dto/create-apprenant.dto';
import { UpdateApprenantDto } from './dto/update-apprenant.dto';

@Controller('apprenants')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ApprenantsController {
  constructor(
    private readonly service: ApprenantsService,
    private readonly promotionsService: PromotionsService,
  ) {}

  @Post()
  @Roles(ROLE.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateApprenantDto) {
    const data = await this.service.create(dto);
    return ResponseHelper.success(data, 'Apprenant cree avec succes');
  }

  @Get()
  @Roles(ROLE.POLE_EMPLOI, ROLE.MANAGER)
  async findAll(@Query() query: ApprenantsQueryDto) {
    // Filtrer automatiquement par la promotion active pour MANAGER et POLE_EMPLOI
    const activePromotion = await this.promotionsService.getActive();
    if (activePromotion) {
      query.promotionId = activePromotion.id;
    }

    const data = await this.service.findAll(query);
    return ResponseHelper.success(data);
  }

  @Get('me')
  @Roles(ROLE.APPRENANT)
  async me(@Req() req: Request & { user: { id: string } }) {
    const data = await this.service.getMe(req.user.id);
    return ResponseHelper.success(data);
  }

  @Put('me')
  @Roles(ROLE.APPRENANT)
  async updateMe(
    @Req() req: Request & { user: { id: string } },
    @Body() dto: UpdateApprenantDto,
  ) {
    const data = await this.service.updateMe(req.user.id, dto);
    return ResponseHelper.success(data, 'Profil mis a jour');
  }

  @Get(':id')
  @Roles(ROLE.POLE_EMPLOI, ROLE.MANAGER)
  async findOne(@Param('id') id: string) {
    const data = await this.service.findOne(id);
    return ResponseHelper.success(data);
  }

  @Put(':id')
  @Roles(ROLE.COACH)
  async update(@Param('id') id: string, @Body() dto: UpdateApprenantDto) {
    const data = await this.service.update(id, dto);
    return ResponseHelper.success(data, 'Apprenant modifie avec succes');
  }

  @Delete(':id')
  @Roles(ROLE.ADMIN)
  async remove(@Param('id') id: string) {
    const data = await this.service.remove(id);
    return ResponseHelper.success(data);
  }
}
