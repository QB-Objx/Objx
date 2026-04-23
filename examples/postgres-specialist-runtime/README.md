# postgres-specialist-runtime example project

Projeto funcional com código real para usar as APIs PostgreSQL specialist do `@qbobjx/plugins`.

## Estrutura

- `src/main.mjs`: provisiona schema interno, publica evento, enqueue job e usa cache.
- `src/worker.mjs`: worker da fila (`startQueueWorker`).
- `src/dispatcher.mjs`: dispatcher do outbox (`startEventDispatcher`).
- `src/runtime.mjs`: cria `Pool` do `pg` e o runtime.

## Rodando

```bash
cd examples/postgres-specialist-runtime
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

## Observações

- O `main` chama `runtime.provisionInternalSchema(...)`, então as tabelas `objx_internal.*` são criadas automaticamente.
- Para produção, use credenciais seguras e supervisão de processos (systemd, container orchestrator, etc).
