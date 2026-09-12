import { DefaultNamingStrategy } from 'typeorm';
import { snakeCase } from 'typeorm/util/StringUtils';

/**
 * Maps camelCase entity properties onto snake_case column names so that both
 * drivers (MySQL in prod/dev, SQLite in tests) address exactly the same
 * column names — the schema is created from these same entity metadata via
 * TypeORM `synchronize`, so runtime and DDL can never drift apart.
 *
 * Without this strategy TypeORM addresses columns by their property names
 * (`primaryProvider`, `isVerified`, …). That is invisible in the test
 * environment (SQLite is created from the same entity metadata, so both sides
 * agree) but every query against the MySQL database fails with
 * `Unknown column … in 'field list'`, because synchronize spells them
 * `primary_provider`, `is_verified`, …
 *
 * Explicit names (`@Column({ name: '…' })`, `@JoinColumn({ name: '…' })`,
 * `@Entity('users')`) always win — the strategy only fills in the blanks.
 */
export class SnakeNamingStrategy extends DefaultNamingStrategy {
  override tableName(targetName: string, userSpecifiedName?: string): string {
    return userSpecifiedName ?? snakeCase(targetName);
  }

  override columnName(
    propertyName: string,
    customName: string,
    embeddedPrefixes: string[],
  ): string {
    return snakeCase(embeddedPrefixes.concat(customName ?? propertyName).join('_'));
  }

  override relationName(propertyName: string): string {
    return snakeCase(propertyName);
  }

  override joinColumnName(relationName: string, referencedColumnName: string): string {
    return snakeCase(relationName + '_' + referencedColumnName);
  }

  override joinTableName(
    firstTableName: string,
    secondTableName: string,
    firstPropertyName: string,
    secondPropertyName: string,
  ): string {
    return snakeCase(
      firstTableName + '_' + firstPropertyName.replaceAll('_', '') + '_' + secondTableName,
    );
  }

  override joinTableColumnName(
    tableName: string,
    propertyName: string,
    columnName?: string,
  ): string {
    return snakeCase(tableName + '_' + (columnName ?? propertyName));
  }

  override joinTableInverseColumnName(
    tableName: string,
    propertyName: string,
    columnName?: string,
  ): string {
    return snakeCase(tableName + '_' + (columnName ?? propertyName));
  }

  // Constraint-name helpers (`primaryKeyName`, `foreignKeyName`, `indexName`,
  // …) are inherited unchanged: generated hash names are valid on MySQL 8 and
  // SQLite alike.
}
