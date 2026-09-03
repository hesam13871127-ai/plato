#!/usr/bin/env node
/**
 * Prints the canonical MySQL schema (database/schema.sql) to stdout.
 * Useful for piping into a mysql client:
 *   npm run db:schema | mysql -u root -p vibetable
 */
const { readFileSync } = require('fs');
const { join } = require('path');

const schemaPath = join(__dirname, '..', '..', 'database', 'schema.sql');
process.stdout.write(readFileSync(schemaPath, 'utf8'));
