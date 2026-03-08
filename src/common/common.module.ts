import { Global, Module } from '@nestjs/common';
import { CacheVersionService } from './services/cache-version.service';

@Global()
@Module({
  providers: [CacheVersionService],
  exports: [CacheVersionService],
})
export class CommonModule {}
