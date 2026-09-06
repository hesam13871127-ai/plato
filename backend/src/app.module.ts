import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import configuration, { AppConfig } from './config/configuration';
import { validationSchema } from './config/validation.schema';
import { DatabaseModule } from './database/database.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { ErrorTrackingService } from './common/observability/error-tracking.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { HealthModule } from './health/health.module';
import { ChatModule } from './chat/chat.module';
import { GameModule } from './game/game.module';
import { CompetitiveModule } from './competitive/competitive.module';
import { EconomyModule } from './economy/economy.module';
import { ShopModule } from './shop/shop.module';
import { QuestsModule } from './quests/quests.module';
import { SocialModule } from './social/social.module';
import { ModerationModule } from './moderation/moderation.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema,
      validationOptions: { abortEarly: false },
    }),
    // Global HTTP rate limiting: 120 requests / 15s / IP by default. Auth and
    // chat endpoints declare stricter named throttlers. The ThrottlerGuard runs
    // after the global JwtAuthGuard so authenticated users are keyed by id.
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const limits = config.get('rateLimit', { infer: true });
        const isTest = config.get('isTest', { infer: true });
        return {
          // Tests exercise many signups from one host; keep limits generous.
          throttlers: [{ ttl: limits.ttl, limit: isTest ? 100_000 : limits.limit }],
          // Key by authenticated user when present, else client IP.
          tracker: (req: { user?: { id?: string }; ip?: string }) => req.user?.id ?? req.ip ?? 'anon',
        };
      },
    }),
    DatabaseModule,
    ModerationModule,
    EconomyModule,
    AuthModule,
    UsersModule,
    ShopModule,
    QuestsModule,
    HealthModule,
    ChatModule,
    GameModule,
    CompetitiveModule,
    SocialModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    {
      provide: APP_FILTER,
      useFactory: (errorTracking: ErrorTrackingService) => new AllExceptionsFilter(errorTracking),
      inject: [ErrorTrackingService],
    },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    },
  ],
})
export class AppModule {}
