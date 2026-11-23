import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { IsOptional, IsUUID } from 'class-validator';
import type { TenantPrisma } from '../database';
import { CurrentUser, RequirePermission, TenantDb } from '../common/decorators';
import type { AuthUser } from '../common/request';
import { ParentService } from './parent.service';

class TermQuery {
  @IsOptional()
  @IsUUID()
  termId?: string;
}

@Controller('parent')
export class ParentController {
  constructor(private readonly parent: ParentService) {}

  @Get('children')
  @RequirePermission('child.read')
  children(@TenantDb() db: TenantPrisma, @CurrentUser() user: AuthUser) {
    return this.parent.overview(db, user.id);
  }

  @Get('children/:id')
  @RequirePermission('child.read')
  child(
    @TenantDb() db: TenantPrisma,
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() q: TermQuery,
  ) {
    return this.parent.child(db, user.id, id, q.termId);
  }
}
