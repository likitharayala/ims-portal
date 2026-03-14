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
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      const normalizedOrigin = origin.replace(/\/$/, '');
      const isAllowedOrigin = allowedOrigins.some(
        (allowedOrigin) => allowedOrigin.replace(/\/$/, '') === normalizedOrigin,
      );

      let isVercelPreview = false;
      try {
        const parsedOrigin = new URL(origin);
        isVercelPreview =
          parsedOrigin.protocol === 'https:' &&
          parsedOrigin.hostname.endsWith('.vercel.app');
      } catch {
        isVercelPreview = false;
      }

      if (isAllowedOrigin || isVercelPreview) {
        callback(null, true);
        return;
      }

      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Global prefix
  app.setGlobalPrefix('api/v1');

  const port = process.env.PORT || 8080;
  await app.listen(port, '0.0.0.0');
  console.log(`Teachly backend running on port ${port}/api/v1`);
}

bootstrap();
