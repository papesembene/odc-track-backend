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
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';
import { ROLE } from '@prisma/client';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { ResponseHelper } from 'src/common/helpers/response.helper';
import { DocumentsService } from './documents.service';
import { DocumentsQueryDto } from './dto/documents-query.dto';
import { CreateDocumentDto } from './dto/create-document.dto';

@Controller()
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
export class DocumentsController {
  constructor(private readonly service: DocumentsService) {}

  /**
   * Liste les documents d'un apprenant.
   * Staff autorisé; un apprenant peut lire uniquement ses propres documents.
   */
  @Get('/apprenants/:apprenantId/documents')
  @Roles(ROLE.POLE_EMPLOI, ROLE.MANAGER, ROLE.COACH, ROLE.APPRENANT)
  async findByApprenant(
    @Param('apprenantId') apprenantId: string,
    @Query() query: DocumentsQueryDto,
    @Req() req: Request & { user: { id: string; role: ROLE } },
  ) {
    const data = await this.service.findByApprenant(
      apprenantId,
      query,
      req.user.id,
      req.user.role,
    );
    return ResponseHelper.success(data);
  }

  /**
   * Détail d'un document.
   */
  @Get('/documents/:id')
  @Roles(ROLE.POLE_EMPLOI, ROLE.MANAGER, ROLE.COACH, ROLE.APPRENANT)
  async findOne(
    @Param('id') id: string,
    @Req() req: Request & { user: { id: string; role: ROLE } },
  ) {
    const data = await this.service.findOne(id, req.user.id, req.user.role);
    return ResponseHelper.success(data);
  }

  /**
   * Upload d'un document par l'apprenant connecté.
   */
  @Post('/apprenants/me/documents')
  @Roles(ROLE.APPRENANT)
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  async uploadForMe(
    @Req() req: Request & { user: { id: string } },
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: CreateDocumentDto,
  ) {
    const data = await this.service.uploadForMe(req.user.id, file, dto);
    return ResponseHelper.success(data, 'Document ajoute avec succes');
  }

  /**
   * Suppression d'un document par son propriétaire apprenant.
   */
  @Delete('/documents/:id')
  @Roles(ROLE.APPRENANT)
  async removeForMe(
    @Param('id') id: string,
    @Req() req: Request & { user: { id: string } },
  ) {
    const data = await this.service.removeForMe(id, req.user.id);
    return ResponseHelper.success(data);
  }
}
