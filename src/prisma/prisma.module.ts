import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { DatabaseHealthService } from './database-health.service';

@Global()
@Module({
  providers: [PrismaService, DatabaseHealthService],
  exports: [PrismaService, DatabaseHealthService],
})
export class PrismaModule {}
