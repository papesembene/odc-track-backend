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
  UseGuards,
} from '@nestjs/common';
import { ReferentielsService } from './referentiels.service';
import { CreateReferentielDto } from './dto/create-referentiel.dto';
import { UpdateReferentielDto } from './dto/update-referentiel.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { ROLE } from '@prisma/client';
import { ResponseHelper } from 'src/common/helpers/response.helper';

@Controller('referentiels')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReferentielsController {
  constructor(private readonly service: ReferentielsService) {}

  @Post()
  @Roles(ROLE.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateReferentielDto) {
    const data = await this.service.create(dto);
    return ResponseHelper.success(data, 'Référentiel créé avec succès');
  }

  @Get()
  async findAll() {
    const data = await this.service.findAll();
    return ResponseHelper.success(data);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const data = await this.service.findOne(id);
    return ResponseHelper.success(data);
  }

  @Put(':id')
  @Roles(ROLE.ADMIN)
  async update(@Param('id') id: string, @Body() dto: UpdateReferentielDto) {
    const data = await this.service.update(id, dto);
    return ResponseHelper.success(data, 'Référentiel modifié avec succès');
  }

  @Delete(':id')
  @Roles(ROLE.ADMIN)
  async remove(@Param('id') id: string) {
    const data = await this.service.remove(id);
    return ResponseHelper.success(data);
  }
}
