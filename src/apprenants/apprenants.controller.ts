import {
  BadRequestException,
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
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { ROLE } from '@prisma/client';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { ResponseHelper } from 'src/common/helpers/response.helper';
import { PromotionsService } from 'src/promotions/promotions.service';
import { ApprenantsService } from './apprenants.service';
import { ApprenantsQueryDto } from './dto/apprenants-query.dto';
import { CreateApprenantDto } from './dto/create-apprenant.dto';
import { UpdateApprenantDto } from './dto/update-apprenant.dto';
import { ApprenantsImportService } from './import/apprenants-import.service';
import { ExcelParserService } from './import/excel-parser.service';

@Controller('apprenants')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ApprenantsController {
  constructor(
    private readonly service: ApprenantsService,
    private readonly promotionsService: PromotionsService,
    private readonly importService: ApprenantsImportService,
    private readonly excelParser: ExcelParserService,
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
    // La promotion active reste le filtre par defaut, sans bloquer une
    // promotion explicitement choisie dans l'interface.
    const activePromotion = await this.promotionsService.getActive();
    if (!query.promotionId && activePromotion) {
      query.promotionId = activePromotion.id;
    }

    const data = await this.service.findAll(query);
    return ResponseHelper.success(data);
  }

  @Get('master-data')
  @Roles(ROLE.POLE_EMPLOI, ROLE.MANAGER)
  async findAllMasterData(@Query() query: ApprenantsQueryDto) {
    query.forceRefresh = true;
    const activePromotion = await this.promotionsService.getActiveFromInOdc({
      forceRefresh: true,
    });
    if (!query.promotionId && activePromotion) {
      query.promotionId = activePromotion.id;
    }

    const data = await this.service.findAllFromInOdc(query);
    return ResponseHelper.success(data);
  }

  @Get('export/xlsx')
  @Roles(ROLE.POLE_EMPLOI, ROLE.MANAGER)
  async exportXlsx(@Query() query: ApprenantsQueryDto, @Res() res: Response) {
    const activePromotion = await this.promotionsService.getActive();
    if (!query.promotionId && activePromotion) {
      query.promotionId = activePromotion.id;
    }

    const file = await this.service.exportXlsx(query);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.fileName}"`,
    );
    res.send(file.buffer);
  }

  @Get('import/historique/template')
  @Roles(ROLE.ADMIN, ROLE.POLE_EMPLOI, ROLE.MANAGER)
  async downloadHistoricalTemplate(@Res() res: Response) {
    const file = await this.importService.buildHistoricalTemplate();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.fileName}"`,
    );
    res.send(file.buffer);
  }

  @Post('import/historique')
  @Roles(ROLE.ADMIN, ROLE.POLE_EMPLOI, ROLE.MANAGER)
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  async importHistorical(
    @Body('promotionName') promotionName: string,
    @Body('referentialName') referentialName: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Fichier manquant');
    }

    if (!promotionName?.trim()) {
      throw new BadRequestException('Nom de promotion historique requis');
    }

    if (!referentialName?.trim()) {
      throw new BadRequestException('Nom de referentiel requis');
    }

    const fileName = file.originalname.toLowerCase();
    const isCsv = fileName.endsWith('.csv');
    const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');

    if (!isCsv && !isExcel) {
      throw new BadRequestException(
        'Format non supporte. Utilisez un fichier .csv, .xls ou .xlsx',
      );
    }

    const data = isCsv
      ? await this.importService.importHistoricalCsv(
          file.buffer.toString('utf-8'),
          promotionName,
          referentialName,
        )
      : await (() => {
          const { headers, rows } = this.excelParser.parse(file.buffer);
          return this.importService.importHistoricalRows(
            headers,
            rows,
            promotionName,
            referentialName,
          );
        })();

    return ResponseHelper.success(
      data,
      'Import historique des apprenants termine',
    );
  }

  @Get('master-data/:id')
  @Roles(ROLE.POLE_EMPLOI, ROLE.MANAGER)
  async findOneMasterData(@Param('id') id: string) {
    const data = await this.service.findOneFromInOdc(id);
    return ResponseHelper.success(data);
  }

  @Post(':id/resend-historical-credentials')
  @Roles(ROLE.ADMIN, ROLE.POLE_EMPLOI, ROLE.MANAGER)
  @HttpCode(HttpStatus.OK)
  async resendHistoricalCredentials(@Param('id') id: string) {
    const data = await this.service.resendHistoricalCredentials(id);
    return ResponseHelper.success(
      data,
      'Identifiants historiques renvoyes avec succes',
    );
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
