import { definePlugin, type ObjxPlugin } from '@qbobjx/core';

import { type PostgresPluginBaseOptions, withDefaultMetadataKey } from './shared.js';

export interface PostgresSecurityPluginOptions extends PostgresPluginBaseOptions {
  readonly tenantSettingName?: string;
  readonly enforceRls?: boolean;
}

export interface PostgresSecurityPluginMetadata {
  readonly tenantSettingName: string;
  readonly enforceRls: boolean;
}

export const POSTGRES_SECURITY_METADATA_KEY = 'postgres.security';

export function createPostgresSecurityPlugin(
  options: PostgresSecurityPluginOptions = {},
): Readonly<ObjxPlugin> {
  const metadataKey = withDefaultMetadataKey(options.metadataKey, POSTGRES_SECURITY_METADATA_KEY);

  return definePlugin({
    name: 'postgres-security',
    hooks: {
      onModelRegister(context) {
        context.setMetadata(metadataKey, {
          tenantSettingName: options.tenantSettingName ?? 'objx.tenant_id',
          enforceRls: options.enforceRls ?? true,
        } satisfies PostgresSecurityPluginMetadata);
      },
    },
  });
}

export function createEnableRlsSql(table: string): string {
  return `alter table ${table} enable row level security;`;
}

export function createTenantIsolationPolicySql(options: {
  readonly table: string;
  readonly tenantColumn?: string;
  readonly settingName?: string;
  readonly policyName?: string;
}): string {
  const tenantColumn = options.tenantColumn ?? 'tenant_id';
  const settingName = options.settingName ?? 'objx.tenant_id';
  const policyName = options.policyName ?? `${options.table}_tenant_isolation`;
  return `create policy ${policyName} on ${options.table} using (${tenantColumn} = current_setting('${settingName}', true));`;
}

export function createSetLocalTenantSql(settingName = 'objx.tenant_id'): string {
  return `select set_config('${settingName}', $1, true);`;
}
