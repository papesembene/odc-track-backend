import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseHealthService } from './prisma/database-health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly dbHealth: DatabaseHealthService) {}

  @Get('live')
  live() {
    return {
      status: 'ok',
      service: 'odc-track-backend',
    };
  }

  @Get('ready')
  ready() {
    if (!this.dbHealth.isAvailable()) {
      throw new ServiceUnavailableException({
        status: 'error',
        service: 'odc-track-backend',
        database: 'unavailable',
        message: this.dbHealth.getLastError(),
      });
    }

    return {
      status: 'ok',
      service: 'odc-track-backend',
      database: 'available',
    };
  }
}
