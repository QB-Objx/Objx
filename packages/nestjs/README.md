# @qbobjx/nestjs

Integracao oficial do `OBJX` com NestJS.

## O Que Esse Pacote Entrega

- `ObjxModule.forRoot(...)`
- `ObjxModule.forRootAsync(...)`
- token de injecao para a sessao `OBJX`
- `ExecutionContext` por request via interceptor global
- filtro global para `ObjxValidationError`
- host de sessao com `dispose()` no shutdown da aplicacao

## Instalacao

```bash
npm install @qbobjx/nestjs @nestjs/common @nestjs/core @nestjs/platform-express rxjs reflect-metadata
```

Voce tambem precisa do driver que for usar, por exemplo:

```bash
npm install @qbobjx/sqlite-driver @qbobjx/plugins @qbobjx/core
```

## Exemplo Rapido

```ts
import { Module } from '@nestjs/common';
import { createExecutionContextManager } from '@qbobjx/core';
import { ObjxModule } from '@qbobjx/nestjs';
import { createSoftDeletePlugin } from '@qbobjx/plugins';
import {
  createSqliteDriver,
  createSqliteSession,
} from '@qbobjx/sqlite-driver';

@Module({
  imports: [
    ObjxModule.forRootAsync({
      global: true,
      useFactory: () => {
        const executionContextManager = createExecutionContextManager();
        const driver = createSqliteDriver({
          databasePath: './app.sqlite',
          pragmas: ['foreign_keys = on'],
        });
        const session = createSqliteSession({
          driver,
          executionContextManager,
          hydrateByDefault: true,
          plugins: [createSoftDeletePlugin()],
        });

        return {
          session,
          dispose: () => driver.close(),
          requestContext: {
            enabled: true,
          },
        };
      },
    }),
  ],
})
export class AppModule {}
```

## Injecao Da Sessao

```ts
import { Injectable } from '@nestjs/common';
import { InjectObjxSession } from '@qbobjx/nestjs';
import { createSqliteSession } from '@qbobjx/sqlite-driver';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectObjxSession()
    private readonly session: ReturnType<typeof createSqliteSession>,
  ) {}
}
```

## Request Context

Por padrao, o interceptor le:

- `x-tenant-id`
- `x-actor-id`
- `x-request-id`

E adiciona tambem:

- `requestMethod`
- `requestPath`

Voce pode sobrescrever isso usando `requestContext.resolveValues`.
