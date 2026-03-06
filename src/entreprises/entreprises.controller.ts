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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { ROLE } from '@prisma/client';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { ResponseHelper } from 'src/common/helpers/response.helper';
import { EntreprisesService } from './entreprises.service';
import { CreateEntrepriseDto } from './dto/create-entreprise.dto';
import { UpdateEntrepriseDto } from './dto/update-entreprise.dto';
import { EntreprisesQueryDto } from './dto/entreprises-query.dto';

@Controller('entreprises')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
export class EntreprisesController {
  constructor(private readonly service: EntreprisesService) {}

  @Post()
  @Roles(ROLE.POLE_EMPLOI)
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateEntrepriseDto) {
    const data = await this.service.create(dto);
    return ResponseHelper.success(data, 'Entreprise créée avec succès');
  }

  @Get()
  @Roles(ROLE.POLE_EMPLOI, ROLE.APPRENANT)
  async findAll(@Query() query: EntreprisesQueryDto) {
    const data = await this.service.findAll(query);
    return ResponseHelper.success(data);
  }

  @Get(':id')
  @Roles(ROLE.POLE_EMPLOI)
  async findOne(@Param('id') id: string) {
    const data = await this.service.findOne(id);
    return ResponseHelper.success(data);
  }

  @Put(':id')
  @Roles(ROLE.POLE_EMPLOI)
  async update(@Param('id') id: string, @Body() dto: UpdateEntrepriseDto) {
    const data = await this.service.update(id, dto);
    return ResponseHelper.success(data, 'Entreprise modifiée avec succès');
  }

  @Delete(':id')
  @Roles(ROLE.POLE_EMPLOI)
  async remove(@Param('id') id: string) {
    const data = await this.service.remove(id);
    return ResponseHelper.success(data);
  }
}
