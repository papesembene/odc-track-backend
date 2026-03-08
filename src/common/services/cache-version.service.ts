import { Injectable } from '@nestjs/common';

@Injectable()
export class CacheVersionService {
  private readonly versions = new Map<string, number>();

  getVersion(namespace: string) {
    return this.versions.get(namespace) ?? 0;
  }

  bumpVersion(namespace: string) {
    const nextVersion = this.getVersion(namespace) + 1;
    this.versions.set(namespace, nextVersion);
    return nextVersion;
  }
}
