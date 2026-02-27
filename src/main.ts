import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

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

  // CORS
  app.enableCors();

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
bootstrap();
