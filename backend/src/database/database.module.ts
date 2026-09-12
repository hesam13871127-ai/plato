import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { AppConfig } from '../config/configuration';
import { SchemaCheckRepairService } from './schema-check-repair.service';
import { entities } from './entities';
import { SnakeNamingStrategy } from './snake-naming.strategy';

/**
 * Database wiring. There are no SQL files and no migrations in this project:
 * TypeORM's `synchronize` keeps the database schema in lockstep with the
 * entity metadata on every boot (fresh databases are created, existing
 * databases are updated incrementally without touching data).
 *
 * Production / development uses MySQL 8.0; the test environment runs the same
 * entity metadata against in-memory SQLite with `synchronize` so the API can
 * be exercised without an external database.
 *
 * Both paths share the SnakeNamingStrategy so all drivers address exactly
 * the same snake_case column names.
 *
 * On MySQL, TypeORM 0.3.x does not manage CHECK constraints at all, so
 * SchemaCheckRepairService reconciles stored checks with the entity
 * metadata on every boot (it also heals databases created by the old
 * schema.sql before the entity-only era).
 */
@Module({
  providers: [SchemaCheckRepairService],
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const db = config.get('database', { infer: true });
        const logger = new Logger('DatabaseModule');

        if (db.type === 'sqlite') {
          logger.log('driver: sqljs (test) | column naming: snake_case [ok]');
          return {
            type: 'sqljs',
            location: ':memory:',
            autoSave: false,
            entities,
            synchronize: true,
            dropSchema: true,
            namingStrategy: new SnakeNamingStrategy(),
            // sql.js is loaded lazily so the production (MySQL) build never
            // pulls the WASM binary into memory.
          };
        }

        logger.log(
          `driver: mysql (${db.host}:${db.port}/${db.database}) | column naming: snake_case [ok] | synchronize: ${db.synchronize}`,
        );

        return {
          type: 'mysql',
          host: db.host,
          port: db.port,
          username: db.username,
          password: db.password,
          database: db.database,
          entities,
          synchronize: db.synchronize,
          namingStrategy: new SnakeNamingStrategy(),
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
