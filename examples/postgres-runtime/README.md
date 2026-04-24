# postgres-runtime example project

Projeto funcional com código real para usar o runtime PostgreSQL do `@qbobjx/plugins` integrado ao driver oficial `@qbobjx/postgres-driver`.

## O que este exemplo mostra

- criação de `Pool` do `pg`
- criação de `session` com `createPostgresSession(...)`
- resolução de configuração/plugins PostgreSQL via `ModelRegistry`
- integração entre:
  - `resolvePostgresIntegration(...)`
  - `createPostgresSession(...)`
  - `createPostgresRuntimeFromSession(...)`
- bootstrap do schema interno `objx_internal`
- enqueue de jobs
- publicação de eventos
- uso de cache
- loops de worker e dispatcher

## Estrutura

- `src/runtime.mjs`: cria `Pool`, `session`, `registry`, integração PostgreSQL e o `runtime`.
- `src/main.mjs`: provisiona schema interno, publica evento, enfileira job e usa cache.
- `src/worker.mjs`: worker da fila com `startQueueWorker(...)`.
- `src/dispatcher.mjs`: dispatcher do outbox com `startEventDispatcher(...)`.

## Rodando

```bash
cd examples/postgres-runtime
cp .env.example .env
npm install
export $(cat .env | xargs)
npm run start
```

Em terminais separados:

```bash
npm run start:worker
npm run start:dispatcher
```

## Como a integração funciona

O fluxo principal deste exemplo é:

1. definir um modelo apenas para carregar plugins/configuração PostgreSQL
2. registrar esse modelo em um `ModelRegistry`
3. resolver a integração com `resolvePostgresIntegration(registry)`
4. passar `executionContextSettings` para `createPostgresSession(...)`
5. criar o runtime com `createPostgresRuntimeFromSession(session, { source: registry })`

Isso garante que:

- o runtime use a configuração real vinda dos plugins
- o driver oficial aplique `set_config(...)` de forma transacional quando necessário
- fila, outbox, cache e demais APIs compartilhem a mesma base de configuração

## Observações

- O `main` chama `runtime.provisionInternalSchema(...)`, então as tabelas `objx_internal.*` são criadas automaticamente.
- Para produção, use credenciais seguras e supervisão de processos.
- Se você usar RLS com `current_setting(...)`, execute o trabalho protegido dentro de `session.transaction(...)`.
- Os workers e dispatchers do runtime já suportam comportamento automático de complete/ack/fail por padrão.