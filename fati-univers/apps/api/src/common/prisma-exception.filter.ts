import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '../database';
import type { Response } from 'express';

/** Traduit les erreurs de base en réponses HTTP claires, sans divulguer de détails internes. */
@Catch(Prisma.PrismaClientKnownRequestError, Prisma.PrismaClientUnknownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Database');

  catch(error: Prisma.PrismaClientKnownRequestError | Prisma.PrismaClientUnknownRequestError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const message = error.message ?? '';

    if (message.includes('row-level security')) {
      this.logger.warn(`Tentative bloquée par la RLS : ${message.split('\n').pop()}`);
      return res.status(HttpStatus.FORBIDDEN).json({ statusCode: 403, message: 'Accès refusé' });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      switch (error.code) {
        case 'P2002':
          return res.status(HttpStatus.CONFLICT).json({ statusCode: 409, message: 'Cet enregistrement existe déjà' });
        case 'P2003':
          return res.status(HttpStatus.BAD_REQUEST).json({ statusCode: 400, message: 'Référence invalide' });
        case 'P2025':
          return res.status(HttpStatus.NOT_FOUND).json({ statusCode: 404, message: 'Introuvable' });
      }
    }
    if (message.startsWith('FATI:') || message.includes('FATI:')) {
      const reason = message.slice(message.indexOf('FATI:') + 5).split('\n')[0]!.trim();
      return res.status(HttpStatus.UNPROCESSABLE_ENTITY).json({ statusCode: 422, message: reason });
    }
    this.logger.error(message);
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ statusCode: 500, message: 'Erreur interne' });
  }
}
