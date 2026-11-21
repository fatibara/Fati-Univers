import { ValidationPipe, type INestApplication } from '@nestjs/common';
import helmet from 'helmet';
import { loadEnv } from './config/env';

/** Réglages communs à la production et aux tests de bout en bout. */
export function configureApp(app: INestApplication) {
  const env = loadEnv();
  // Derrière Vercel (et le relais du site web), l'adresse IP réelle du visiteur
  // est dans X-Forwarded-For : nécessaire pour limiter les tentatives de connexion par visiteur.
  app.getHttpAdapter().getInstance().set('trust proxy', true);
  app.use(helmet());
  app.enableCors({ origin: env.API_CORS_ORIGINS.split(',').map((o) => o.trim()), credentials: true });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // supprime les champs non déclarés
      forbidNonWhitelisted: true, // ... et refuse la requête s'il y en a (ex. un tenantId glissé dans le corps)
      transform: true,
    }),
  );
  app.enableShutdownHooks();
  return env;
}
