import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import type { TenantPrisma } from '../database';
import { CurrentTenant, CurrentUser, RequirePermission, TenantDb } from '../common/decorators';
import type { AuthUser, TenantInfo } from '../common/request';
import { CreateMemberDto, UpdateMemberDto } from './members.dto';
import { MembersService } from './members.service';

@Controller('members')
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  @RequirePermission('users.manage')
  list(@TenantDb() db: TenantPrisma, @CurrentTenant() tenant: TenantInfo) {
    return this.members.list(db, tenant);
  }

  @Post()
  @RequirePermission('users.manage')
  create(@CurrentTenant() tenant: TenantInfo, @CurrentUser() user: AuthUser, @Body() dto: CreateMemberDto) {
    return this.members.create(tenant, user.id, dto);
  }

  @Patch(':id')
  @RequirePermission('users.manage')
  update(
    @TenantDb() db: TenantPrisma,
    @CurrentTenant() tenant: TenantInfo,
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.members.update(db, tenant, user.id, id, dto);
  }

  @Post(':id/resend-code')
  @RequirePermission('users.manage')
  resend(@TenantDb() db: TenantPrisma, @CurrentTenant() tenant: TenantInfo, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.members.resendCode(db, tenant, id);
  }
}
