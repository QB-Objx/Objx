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
