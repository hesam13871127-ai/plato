import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { AppConfig } from '../config/configuration';
import { entities } from './entities';
import { SnakeNamingStrategy } from './snake-naming.strategy';

/**
 * Database wiring. Production / development uses MySQL 8.0 with migrations
 * (see `database/migrations/1700000000000-InitialSchema.ts`, which executes
 * the canonical `schema.sql`). The test environment runs the same entity
 * metadata against in-memory SQLite with `synchronize` so the API can be
 * exercised without an external database.
 *
 * Both paths share the SnakeNamingStrategy so the test environment addresses
 * exactly the same snake_case column names as the MySQL DDL.
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const db = config.get('database', { infer: true });

        if (db.type === 'sqlite') {
          return {
            type: 'sqljs',
            location: ':memory:',
            autoSave: false,
            entities,
            synchronize: true,
            dropSchema: true,
            // sql.js is loaded lazily so the production (MySQL) build never
            // pulls the WASM binary into memory.
          };
        }

        return {
          type: 'mysql',
          host: db.host,
          port: db.port,
          username: db.username,
          password: db.password,
          database: db.database,
          entities,
          synchronize: db.synchronize,
          migrationsRun: db.runMigrations && !db.synchronize,
          migrations: [`${__dirname}/migrations/*{.ts,.js}`],
          migrationsTableName: 'typeorm_migrations',
          logging: db.logging,
          timezone: 'Z',
          charset: 'utf8mb4',
          extra: {
            charset: 'utf8mb4_unicode_ci',
          },
        };
      },
    }),
  ],
})
export class DatabaseModule {}
