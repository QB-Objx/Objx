import 'reflect-metadata';
import process from 'node:process';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: true,
  });

  const port = Number.parseInt(process.env.PORT ?? '3001', 10);
  await app.listen(port);
  console.log(`OBJX NestJS API listening on http://127.0.0.1:${port}`);
}

void bootstrap();
