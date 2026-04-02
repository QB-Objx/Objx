# @qbobjx/nestjs

Official NestJS integration for OBJX.

## Install

```bash
npm install @qbobjx/nestjs @nestjs/common @nestjs/core rxjs
```

Add your driver and core packages as needed, for example:

```bash
npm install @qbobjx/core @qbobjx/sqlite-driver @qbobjx/plugins
```

## What You Get

- `ObjxModule.forRoot(...)`
- `ObjxModule.forRootAsync(...)`
- session injection token and `@InjectObjxSession()` helper
- `ObjxSessionHost<TSession>` service for a typed session host without custom decorators everywhere
- `InferObjxSession<typeof yourFactory>` helper type
- optional request-scoped execution context middleware/interceptor
- global exception filter support for OBJX validation errors

## Quick Usage

```ts
import { Module } from '@nestjs/common';
import { ObjxModule } from '@qbobjx/nestjs';

@Module({
  imports: [
    ObjxModule.forRootAsync({
      global: true,
      useFactory: async () => ({
        session: createSessionSomehow(),
      }),
    }),
  ],
})
export class AppModule {}
```

## Recommended Typing Pattern

If you do not want `ReturnType<typeof createSqliteSession>` repeated across services, infer the
session type once from your module options factory and inject `ObjxSessionHost<TSession>`:

```ts
import { Injectable } from '@nestjs/common';
import { InferObjxSession, ObjxSessionHost } from '@qbobjx/nestjs';

export function createObjxNestModuleOptions() {
  return {
    session: createSessionSomehow(),
  };
}

export type AppObjxSession = InferObjxSession<typeof createObjxNestModuleOptions>;

@Injectable()
export class ProjectsService {
  constructor(private readonly objx: ObjxSessionHost<AppObjxSession>) {}

  listProjects() {
    return this.objx.session.execute(Project.query());
  }
}
```

Use `@InjectObjxSession()` when you only want the bare session. Use `ObjxSessionHost<TSession>` when
you want the typed session plus helper access to the current execution context.
