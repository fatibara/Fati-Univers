import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createPrismaClient, type PrismaClient } from '../database';
import { ENV, type Env } from '../config/env';

/**
 * Deux connexions distinctes :
 *  - app      : rôle fati_app, soumis à la Row-Level Security (99 % des cas) ;
 *  - platform : rôle fati_platform (BYPASSRLS), réservé à la super-administration.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  readonly app: PrismaClient;
  readonly platform: PrismaClient;

  constructor(@Inject(ENV) env: Env) {
    this.app = createPrismaClient(env.DATABASE_URL_APP);
    this.platform = createPrismaClient(env.DATABASE_URL_PLATFORM);
  }

  async onModuleInit(): Promise<void> {
    await this.app.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([this.app.$disconnect(), this.platform.$disconnect()]);
  }
}
