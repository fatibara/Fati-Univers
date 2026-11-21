import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import type { TenantPrisma } from '../database';
import { CurrentTenant, CurrentUser, RequirePermission, TenantDb } from '../common/decorators';
import type { AuthUser, TenantInfo } from '../common/request';
import { CreateStudentDto, ListStudentsQuery } from './students.dto';
import { StudentsService } from './students.service';

@Controller('students')
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  @Get()
  @RequirePermission('students.read')
  list(@TenantDb() db: TenantPrisma, @Query() query: ListStudentsQuery) {
    return this.students.list(db, query);
  }

  @Get(':id')
  @RequirePermission('students.read')
  get(@TenantDb() db: TenantPrisma, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.students.get(db, id);
  }

  @Post()
  @RequirePermission('students.write')
  create(
    @TenantDb() db: TenantPrisma,
    @CurrentTenant() tenant: TenantInfo,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateStudentDto,
  ) {
    return this.students.create(db, tenant, user.id, dto);
  }
}
