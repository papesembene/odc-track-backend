import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { ROLE } from '@prisma/client';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { ResponseHelper } from 'src/common/helpers/response.helper';
import { ApprenantsImportService } from './import/apprenants-import.service';
import { ExcelParserService } from './import/excel-parser.service';

@Controller('referentiels/:referentielId/apprenants')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReferentielApprenantsImportController {
  constructor(
    private readonly importService: ApprenantsImportService,
    private readonly excelParser: ExcelParserService,
  ) {}

  @Post('import')
  @Roles(ROLE.ADMIN)
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  async import(
    @Param('referentielId') referentielId: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Fichier manquant');
    }

    const fileName = file.originalname.toLowerCase();
    const isCsv = fileName.endsWith('.csv');
    const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');

    if (!isCsv && !isExcel) {
      throw new BadRequestException(
        'Format non supporte. Utilisez un fichier .csv, .xls ou .xlsx',
      );
    }

    let data;
    if (isCsv) {
      data = await this.importService.importCsvByReferentiel(
        file.buffer.toString('utf-8'),
        referentielId,
      );
    } else {
      const { headers, rows } = this.excelParser.parse(file.buffer);
      data = await this.importService.importRowsByReferentiel(
        headers,
        rows,
        referentielId,
      );
    }

    return ResponseHelper.success(data, 'Import des apprenants termine');
  }
}
