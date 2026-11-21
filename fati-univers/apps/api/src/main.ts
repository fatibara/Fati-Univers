import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './setup';

// Point d'entrée détecté automatiquement par Vercel (src/main.ts).
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const env = configureApp(app);
  const port = Number(process.env.PORT ?? env.API_PORT);
  await app.listen(port);
  Logger.log(`API FATI UNIVERS prête sur le port ${port} (préfixe /api/v1)`, 'Bootstrap');
}
bootstrap();
