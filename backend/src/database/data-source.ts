import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';
import { entities } from './entities';

loadEnv();

/**
 * CLI TypeORM data source used by the `typeorm`, `migration:run` and
 * `migration:revert` npm scripts. Targets MySQL 8.0.
 */
export const AppDataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: parseInt(process.env.DB_PORT ?? '3306', 10),
  username: process.env.DB_USERNAME ?? 'root',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_DATABASE ?? 'vibetable',
  entities,
  migrations: [`${__dirname}/migrations/*{.ts,.js}`],
  migrationsTableName: 'typeorm_migrations',
  charset: 'utf8mb4',
  logging: false,
});

export default AppDataSource;
