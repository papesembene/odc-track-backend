import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { SwaggerModule } from '@nestjs/swagger';
import { PrismaAvailabilityFilter } from './common/filters/prisma-availability.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configuredOrigins = (process.env.FRONTEND_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const localOriginPattern =
    /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3})(:\d+)?$/;

  // Prefix global
  app.setGlobalPrefix('api/v1');

  // Validation globale
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );
  app.useGlobalFilters(new PrismaAvailabilityFilter());

  // CORS: en production on privilegie la whitelist via FRONTEND_ORIGINS.
  // En local, on garde un fallback pour les URLs de developpement courantes.
  app.enableCors({
    origin: (origin, callback) => {
      if (
        !origin ||
        configuredOrigins.includes(origin) ||
        localOriginPattern.test(origin)
      ) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin non autorisee: ${origin}`), false);
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders:
      'Content-Type, Authorization, Accept, Origin, X-Requested-With',
    credentials: false,
    optionsSuccessStatus: 204,
  });

  //  exposer uploads/documents en statique.
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads/' });

  // Expose la spec YAML en statique pour Swagger UI
  app.useStaticAssets(join(process.cwd(), 'docs'), { prefix: '/docs-assets/' });

  // Swagger spec-first: Swagger UI lit docs/openapi.yaml via URL
  SwaggerModule.setup('docs', app, {} as never, {
    swaggerOptions: {
      url: '/docs-assets/openapi.yaml',
    },
  });

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
