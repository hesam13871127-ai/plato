import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';
import { entities } from './entities';
import { SnakeNamingStrategy } from './snake-naming.strategy';

loadEnv();

/**
 * CLI TypeORM data source. Targets MySQL 8.0 and uses the same
 * SnakeNamingStrategy as the application so any CLI tooling agrees on the
 * snake_case column names the runtime creates via `synchronize`.
 */
export const AppDataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: parseInt(process.env.DB_PORT ?? '3306', 10),
  username: process.env.DB_USERNAME ?? 'root',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_DATABASE ?? 'vibetable',
  entities,
  namingStrategy: new SnakeNamingStrategy(),
  synchronize: true,
  charset: 'utf8mb4',
  logging: false,
});

export default AppDataSource;
