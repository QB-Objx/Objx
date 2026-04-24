import { col, createModelRegistry, defineModel } from "@qbobjx/core";
import { createPostgresSession } from "@qbobjx/postgres-driver";
import {
  createPostgresEventsPlugin,
  createPostgresIntegration,
  createPostgresQueuePlugin,
  createPostgresRuntimeFromSession,
} from "@qbobjx/plugins";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("Missing DATABASE_URL environment variable.");
}

const RuntimeConfig = defineModel({
  name: "RuntimeConfig",
  table: "runtime_config",
  columns: {
    id: col.int().primary(),
    tenantId: col.text(),
  },
  plugins: [
    createPostgresQueuePlugin({
      schema: "objx_internal",
      defaultQueue: "default",
    }),
    createPostgresEventsPlugin({
      schema: "objx_internal",
      notifyChannel: "objx_events",
    }),
  ],
});

const registry = createModelRegistry();
registry.register(RuntimeConfig);

const integration = createPostgresIntegration(registry);

export const pool = new Pool({ connectionString });

export const session = createPostgresSession({
  pool,
  executionContextSettings: integration.executionContextSettings,
});

export const runtime = createPostgresRuntimeFromSession(session, {
  source: registry,
  config: integration.config,
});

export async function closePool() {
  await pool.end();
}
