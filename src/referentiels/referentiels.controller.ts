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
import { ReferentielsService } from './referentiels.service';
import { CreateReferentielDto } from './dto/create-referentiel.dto';
import { UpdateReferentielDto } from './dto/update-referentiel.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { ROLE } from '@prisma/client';
import { ResponseHelper } from 'src/common/helpers/response.helper';
import { ReferentielsQueryDto } from './dto/referentiels-query.dto';

@Controller('referentiels')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReferentielsController {
  constructor(private readonly service: ReferentielsService) {}

  @Post()
  @Roles(ROLE.ADMIN, ROLE.MANAGER)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateReferentielDto) {
    const data = this.service.create(dto);
    return ResponseHelper.success(data, 'Référentiel créé avec succès');
  }

  @Get()
  async findAll(@Query() query: ReferentielsQueryDto) {
    const data = await this.service.findAll(query);
    return ResponseHelper.success(data);
  }

  @Get('master-data')
  async findAllMasterData(@Query() query: ReferentielsQueryDto) {
    const data = await this.service.findAllFromInOdc(query);
    return ResponseHelper.success(data);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const data = await this.service.findOne(id);
    return ResponseHelper.success(data);
  }

  @Put(':id')
  @Roles(ROLE.ADMIN, ROLE.MANAGER)
  update(@Param('id') id: string, @Body() dto: UpdateReferentielDto) {
    const data = this.service.update(id, dto);
    return ResponseHelper.success(data, 'Référentiel modifié avec succès');
  }

  @Delete(':id')
  @Roles(ROLE.ADMIN, ROLE.MANAGER)
  remove(@Param('id') id: string) {
    const data = this.service.remove(id);
    return ResponseHelper.success(data);
  }
}
