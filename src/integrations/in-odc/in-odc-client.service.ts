import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  InOdcLoginResponse,
  InOdcReferenceCoach,
  InOdcReferenceLearner,
  InOdcLearnerDetail,
  InOdcPromotion,
  InOdcReferential,
  InOdcReferenceLearnersQuery,
  InOdcReferenceLearnersResponse,
} from './in-odc.types';

@Injectable()
export class InOdcClientService {
  private readonly logger = new Logger(InOdcClientService.name);
  private readonly cache = new Map<
    string,
    { expiresAt: number; staleUntil: number; data: unknown }
  >();
  private readonly inflightRequests = new Map<string, Promise<unknown>>();
  private readonly defaultCacheTtlMs = 120_000;
  private readonly defaultStaleTtlMs = 900_000;

  constructor(private readonly configService: ConfigService) {}

  async getPromotions(options?: { forceRefresh?: boolean }): Promise<InOdcPromotion[]> {
    return this.getCachedJson<InOdcPromotion[]>(
      '/promotions',
      {},
      {},
      300_000,
      1_800_000,
      options?.forceRefresh,
    );
  }

  async getActivePromotion(options?: { forceRefresh?: boolean }): Promise<InOdcPromotion> {
    return this.getCachedJson<InOdcPromotion>(
      '/promotions/active/reference',
      {},
      {},
      300_000,
      1_800_000,
      options?.forceRefresh,
    );
  }

  async getReferentials(options?: { forceRefresh?: boolean }): Promise<InOdcReferential[]> {
    return this.getCachedJson<InOdcReferential[]>(
      '/referentials/all',
      {},
      {},
      300_000,
      1_800_000,
      options?.forceRefresh,
    );
  }

  async getReferenceLearners(
    query: InOdcReferenceLearnersQuery = {},
    options?: { forceRefresh?: boolean },
  ): Promise<InOdcReferenceLearnersResponse> {
    return this.getCachedJson<InOdcReferenceLearnersResponse>(
      '/learners/reference-list',
      query,
      {},
      120_000,
      600_000,
      options?.forceRefresh,
    );
  }

  async getAllReferenceLearners(
    query: Omit<InOdcReferenceLearnersQuery, 'page' | 'limit'> = {},
    options?: { forceRefresh?: boolean },
  ): Promise<InOdcReferenceLearner[]> {
    const limit = 100;
    let page = 1;
    let totalPages = 1;
    const items: InOdcReferenceLearner[] = [];

    do {
      const response = await this.getReferenceLearners({
        ...query,
        page,
        limit,
      }, options);

      items.push(...response.items);
      totalPages = response.pagination.totalPages;
      page += 1;
    } while (page <= totalPages);

    return items;
  }

  async getLearnerById(id: string): Promise<InOdcLearnerDetail> {
    return this.getJson<InOdcLearnerDetail>(`/learners/${id}`);
  }

  async login(email: string, password: string): Promise<InOdcLoginResponse> {
    return this.postJson<InOdcLoginResponse>('/auth/login', {
      email,
      password,
    });
  }

  async changePassword(
    accessToken: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    await this.putJson(
      '/auth/change-password',
      {
        currentPassword,
        newPassword,
        confirmPassword: newPassword,
      },
      {
        Authorization: `Bearer ${accessToken}`,
      },
    );
  }

  async getLearnerByEmail(
    email: string,
    accessToken: string,
  ): Promise<InOdcLearnerDetail> {
    return this.getJson<InOdcLearnerDetail>(
      `/learners/email/${encodeURIComponent(email)}`,
      {},
      {
        Authorization: `Bearer ${accessToken}`,
      },
    );
  }

  async getCoaches(options?: { forceRefresh?: boolean }): Promise<InOdcReferenceCoach[]> {
    const data = await this.getCachedJson<{ items: InOdcReferenceCoach[] }>(
      '/coaches/reference-list',
      {},
      {},
      this.defaultCacheTtlMs,
      this.defaultStaleTtlMs,
      options?.forceRefresh,
    );

    return data.items;
  }

  private async getCachedJson<T>(
    path: string,
    query: Record<string, string | number | undefined> = {},
    extraHeaders: Record<string, string> = {},
    ttlMs = this.defaultCacheTtlMs,
    staleTtlMs = this.defaultStaleTtlMs,
    forceRefresh = false,
  ): Promise<T> {
    const cacheKey = this.buildCacheKey(path, query, extraHeaders);
    const cached = this.cache.get(cacheKey);
    const now = Date.now();

    if (!forceRefresh && cached && cached.expiresAt > now) {
      return cached.data as T;
    }

    const inflight = forceRefresh ? undefined : this.inflightRequests.get(cacheKey);
    if (inflight) {
      return inflight as Promise<T>;
    }

    const request = this.getJson<T>(path, query, extraHeaders)
      .then((data) => {
        this.cache.set(cacheKey, {
          data,
          expiresAt: Date.now() + ttlMs,
          staleUntil: Date.now() + staleTtlMs,
        });

        return data;
      })
      .catch((error) => {
        if (cached && cached.staleUntil > Date.now()) {
          const status =
            error instanceof HttpException ? error.getStatus() : undefined;

          if (
            status === HttpStatus.TOO_MANY_REQUESTS ||
            error instanceof ServiceUnavailableException
          ) {
            this.logger.warn(
              `Retour cache stale pour in-odc ${path} apres incident temporaire`,
            );
            return cached.data as T;
          }
        }

        throw error;
      })
      .finally(() => {
        this.inflightRequests.delete(cacheKey);
      });

    if (!forceRefresh) {
      this.inflightRequests.set(cacheKey, request);
    }

    return request;
  }

  private async getJson<T>(
    path: string,
    query: Record<string, string | number | undefined> = {},
    extraHeaders: Record<string, string> = {},
  ): Promise<T> {
    const baseUrl = this.getBaseUrl();
    const url = new URL(`${baseUrl}${path}`);

    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }

    const controller = new AbortController();
    const timeoutMs = this.getTimeoutMs();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.buildHeaders(extraHeaders),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        this.logger.error(
          `Echec appel in-odc ${url.pathname}: ${response.status} ${body}`,
        );

        if (response.status === 404) {
          throw new NotFoundException('Ressource in-odc introuvable');
        }

        if (response.status === 429) {
          throw new HttpException(
            'Le service in-odc limite temporairement les requetes',
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }

        throw new ServiceUnavailableException(
          'Le service in-odc est indisponible pour le moment',
        );
      }

      return (await response.json()) as T;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof HttpException ||
        error instanceof ServiceUnavailableException
      ) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        this.logger.error(`Timeout appel in-odc: ${url.pathname}`);
        throw new ServiceUnavailableException(
          'Le service in-odc a mis trop de temps a repondre',
        );
      }

      this.logger.error(
        `Erreur reseau lors de l'appel in-odc ${url.pathname}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException(
        'Impossible de contacter le service in-odc',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private async postJson<T>(path: string, body: Record<string, unknown>) {
    const baseUrl = this.getBaseUrl();
    const url = new URL(`${baseUrl}${path}`);
    const controller = new AbortController();
    const timeoutMs = this.getTimeoutMs();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          ...this.buildHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const bodyText = await response.text();
        this.logger.error(
          `Echec appel in-odc ${url.pathname}: ${response.status} ${bodyText}`,
        );

        if (response.status === 400 || response.status === 401) {
          throw new UnauthorizedException('Email ou mot de passe incorrect');
        }

        if (response.status === 429) {
          throw new HttpException(
            'Le service in-odc limite temporairement les requetes',
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }

        throw new ServiceUnavailableException(
          'Le service in-odc est indisponible pour le moment',
        );
      }

      return (await response.json()) as T;
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof HttpException ||
        error instanceof ServiceUnavailableException
      ) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        this.logger.error(`Timeout appel in-odc: ${url.pathname}`);
        throw new ServiceUnavailableException(
          'Le service in-odc a mis trop de temps a repondre',
        );
      }

      this.logger.error(
        `Erreur reseau lors de l'appel in-odc ${url.pathname}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException(
        'Impossible de contacter le service in-odc',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private async putJson(
    path: string,
    body: Record<string, unknown>,
    extraHeaders: Record<string, string> = {},
  ): Promise<void> {
    const baseUrl = this.getBaseUrl();
    const url = new URL(`${baseUrl}${path}`);
    const controller = new AbortController();
    const timeoutMs = this.getTimeoutMs();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          ...this.buildHeaders(extraHeaders),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const bodyText = await response.text();
        this.logger.error(
          `Echec appel in-odc ${url.pathname}: ${response.status} ${bodyText}`,
        );

        if (response.status === 400 || response.status === 401) {
          throw new UnauthorizedException(
            'Le mot de passe actuel est incorrect ou invalide',
          );
        }

        if (response.status === 429) {
          throw new HttpException(
            'Le service in-odc limite temporairement les requetes',
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }

        throw new ServiceUnavailableException(
          'Le service in-odc est indisponible pour le moment',
        );
      }
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof HttpException ||
        error instanceof ServiceUnavailableException
      ) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        this.logger.error(`Timeout appel in-odc: ${url.pathname}`);
        throw new ServiceUnavailableException(
          'Le service in-odc a mis trop de temps a repondre',
        );
      }

      this.logger.error(
        `Erreur reseau lors de l'appel in-odc ${url.pathname}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException(
        'Impossible de contacter le service in-odc',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildHeaders(
    extraHeaders: Record<string, string> = {},
  ): Record<string, string> {
    const token = this.configService.get<string>('IN_ODC_API_TOKEN')?.trim();

    return {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extraHeaders,
    };
  }

  private getBaseUrl(): string {
    const baseUrl = this.configService
      .get<string>('IN_ODC_API_BASE_URL')
      ?.trim();

    if (!baseUrl) {
      throw new ServiceUnavailableException(
        'IN_ODC_API_BASE_URL est manquante dans la configuration',
      );
    }

    return baseUrl.replace(/\/+$/, '');
  }

  private getTimeoutMs(): number {
    const minimumTimeoutMs = 20000;
    const rawValue =
      this.configService.get<string>('IN_ODC_API_TIMEOUT_MS') ??
      String(minimumTimeoutMs);
    const timeoutMs = Number(rawValue);

    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      return minimumTimeoutMs;
    }

    return Math.max(timeoutMs, minimumTimeoutMs);
  }

  private buildCacheKey(
    path: string,
    query: Record<string, string | number | undefined>,
    extraHeaders: Record<string, string>,
  ): string {
    return JSON.stringify({
      path,
      query: Object.entries(query)
        .filter(
          ([, value]) => value !== undefined && value !== null && value !== '',
        )
        .sort(([left], [right]) => left.localeCompare(right)),
      headers: Object.entries(extraHeaders).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    });
  }
}
