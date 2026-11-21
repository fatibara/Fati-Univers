import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, NoTenant } from '../common/decorators';
import type { AuthUser } from '../common/request';
import { CreateSchoolDto, SchoolStatusDto } from './platform.dto';
import { PlatformService } from './platform.service';
import { SuperAdminGuard } from './super-admin.guard';

@Controller('platform')
@NoTenant()
@UseGuards(SuperAdminGuard)
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}

  @Get('schools')
  list() {
    return this.platform.listSchools();
  }

  @Post('schools')
  create(@Body() dto: CreateSchoolDto, @CurrentUser() user: AuthUser) {
    return this.platform.createSchool(dto, user.id);
  }

  @Patch('schools/:id/status')
  setStatus(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: SchoolStatusDto, @CurrentUser() user: AuthUser) {
    return this.platform.setStatus(id, dto.status, user.id);
  }

  @Post('schools/:id/resend-code')
  resend(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.platform.resendDirectorCode(id);
  }
}
