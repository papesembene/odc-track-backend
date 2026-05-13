import { Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { ROLE } from '@prisma/client';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { ResponseHelper } from 'src/common/helpers/response.helper';
import { MasterDataSyncService } from './master-data-sync.service';

@Controller('master-data')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
export class MasterDataController {
  constructor(private readonly masterDataSyncService: MasterDataSyncService) {}

  @Get('sync-status')
  @Roles(ROLE.ADMIN, ROLE.MANAGER)
  async getSyncStatus() {
    const data = await this.masterDataSyncService.getSyncStatus();
    return ResponseHelper.success(data);
  }

  @Post('sync')
  @Roles(ROLE.ADMIN, ROLE.MANAGER)
  @HttpCode(HttpStatus.OK)
  async syncNow() {
    const data = await this.masterDataSyncService.syncAll();
    return ResponseHelper.success(
      data,
      'Synchronisation locale des master data terminee',
    );
  }
}
