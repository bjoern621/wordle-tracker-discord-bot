import pg from 'pg';

// Schema is managed declaratively by pgschema (see db/schema.sql); the app only
// issues queries. Connection comes from DATABASE_URL.
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
