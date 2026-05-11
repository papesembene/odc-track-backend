import { Global, Module } from '@nestjs/common';
import { InOdcClientService } from './in-odc-client.service';

@Global()
@Module({
  providers: [InOdcClientService],
  exports: [InOdcClientService],
})
export class InOdcModule {}
