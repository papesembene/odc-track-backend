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
  @Roles(ROLE.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreatePromotionDto) {
    const data = await this.service.create(dto);
    return ResponseHelper.success(data, 'Promotion créée avec succès');
  }

  @Get()
  async findAll(@Query() query: PromotionsQueryDto) {
    const data = await this.service.findAll(query);
    return ResponseHelper.success(data);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const data = await this.service.findOne(id);
    return ResponseHelper.success(data);
  }

  @Put(':id')
  @Roles(ROLE.ADMIN)
  async update(@Param('id') id: string, @Body() dto: UpdatePromotionDto) {
    const data = await this.service.update(id, dto);
    return ResponseHelper.success(data, 'Promotion modifiée avec succès');
  }

  @Delete(':id')
  @Roles(ROLE.ADMIN)
  async remove(@Param('id') id: string) {
    const data = await this.service.remove(id);
    return ResponseHelper.success(data);
  }
}
