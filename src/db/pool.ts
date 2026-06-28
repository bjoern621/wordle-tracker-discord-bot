import pg from 'pg';
import { config } from '../config/index.js';

// Schema is managed declaratively by pgschema (see db/schema.sql); the app only
// issues queries. Connection comes from the validated DATABASE_URL.
export const pool = new pg.Pool({ connectionString: config.databaseUrl });
