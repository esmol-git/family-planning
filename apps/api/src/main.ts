import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

function assertProductionConfig() {
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) return;

  const secret = process.env.JWT_SECRET ?? '';
  if (!secret || secret === 'change-me' || secret.length < 32) {
    throw new Error(
      'Production: задайте JWT_SECRET (≥32 символов, не change-me)',
    );
  }
  if (!process.env.CORS_ORIGIN) {
    throw new Error('Production: задайте CORS_ORIGIN (например https://calendar.example.com)');
  }
}

async function bootstrap() {
  assertProductionConfig();

  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  const corsOrigins = process.env.CORS_ORIGIN?.split(',').map((s) => s.trim()).filter(Boolean);
  app.enableCors({
    origin: corsOrigins?.length ? corsOrigins : true,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_SWAGGER === '1') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Семейный календарь API')
      .setDescription('Family calendar API')
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
    logger.log('Swagger: /api/docs');
  }

  const port = Number(process.env.API_PORT ?? 3000);
  await app.listen(port);
  logger.log(`API listening on http://localhost:${port}`);
}

bootstrap();
