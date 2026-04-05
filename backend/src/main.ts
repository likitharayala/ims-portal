import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const isProduction = process.env.APP_ENV === 'production';
  const allowedOrigins = [
    process.env.FRONTEND_URL,
    !isProduction ? 'http://localhost:3000' : null,
  ].filter((origin): origin is string => Boolean(origin));

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS — frontend domain only
  // Temporary debugging fix: allow all origins to verify whether CORS is causing login failures.
  app.enableCors({
    origin: true,
    credentials: true,
  });

  // Global prefix
  app.setGlobalPrefix('api/v1');

  const port = process.env.PORT || 8080;
  await app.listen(port, '0.0.0.0');
  console.log(`Teachly backend running on port ${port}/api/v1`);
}

bootstrap();
