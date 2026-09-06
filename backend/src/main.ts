import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import type { AppConfig } from './config/configuration';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  // Security headers (CSP, HSTS, no-sniff, frameguard, etc.). The CSP is
  // relaxed for the Swagger UI path only; API responses are JSON.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );

  // The API is stateless JSON over JWT; no credentials are sent via cookies,
  // but CSRF-safe same-site defaults and a referrer policy are still set.
  app.use((req: { path: string }, res: { setHeader: (k: string, v: string) => void }, next: () => void) => {
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });

  const config = app.get(ConfigService<AppConfig, true>);
  const port = config.get('port', { infer: true });
  const apiPrefix = config.get('apiPrefix', { infer: true });
  const corsOrigins = config.get('corsOrigins', { infer: true });

  // `/health` stays unprefixed for load balancers; every other route gets /api.
  app.setGlobalPrefix(apiPrefix, {
    exclude: [{ path: 'health', method: RequestMethod.GET }],
  });

  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : true,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('VibeTable API')
    .setDescription(
      'VibeTable platform API — authentication, players, social graph, table games, economy and realtime.',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', name: 'Authorization', in: 'header' },
      'access-token',
    )
    .addTag('auth')
    .addTag('users')
    .addTag('health')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`VibeTable API listening on http://0.0.0.0:${port}/${apiPrefix}`);
  // eslint-disable-next-line no-console
  console.log(`Swagger docs available at http://0.0.0.0:${port}/docs`);
}

void bootstrap();
