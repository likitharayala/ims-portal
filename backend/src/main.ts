import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    logger:
      process.env.APP_ENV === 'production'
        ? ['error', 'warn', 'log']
        : ['error', 'warn', 'log', 'debug', 'verbose'],
  });
  const frontendUrl = process.env.FRONTEND_URL?.replace(/\/$/, '');
  const port = process.env.PORT || 8080;

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
      const isConfiguredFrontend = normalizedOrigin === frontendUrl;
      const isLocalDevelopment = normalizedOrigin === 'http://localhost:3000';

      let isVercelDeployment = false;
      try {
        const { hostname } = new URL(normalizedOrigin);
        isVercelDeployment =
          hostname === 'vercel.app' || hostname.endsWith('.vercel.app');
      } catch {
        isVercelDeployment = false;
      }

      if (isConfiguredFrontend || isLocalDevelopment || isVercelDeployment) {
        callback(null, true);
        return;
      }

      callback(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Global prefix
  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();

  await app.listen(port, '0.0.0.0');

  logger.log(`Teachly backend listening on 0.0.0.0:${port}`);
  logger.log(`API prefix: /api/v1`);
  if (frontendUrl) {
    logger.log(`Configured frontend origin: ${frontendUrl}`);
  } else {
    logger.warn('FRONTEND_URL is not set; only localhost and Vercel preview domains will be allowed by CORS.');
  }
}

bootstrap();
