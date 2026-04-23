import { Pool } from 'pg';
import { createPostgresSpecialistRuntime } from '@qbobjx/plugins';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('Missing DATABASE_URL environment variable.');
}

export const pool = new Pool({ connectionString });

export const runtime = createPostgresSpecialistRuntime({
  async execute(sql, params = []) {
    const result = await pool.query(sql, params);

    if (result.rows.length === 0) {
      return null;
    }

    if (result.rows.length === 1) {
      return result.rows[0];
    }

    return result.rows;
  },
});

export async function closePool() {
  await pool.end();
}
