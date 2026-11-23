import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import type { TenantPrisma } from '../database';
import { CurrentTenant, CurrentUser, RequirePermission, TenantDb } from '../common/decorators';
import type { AuthUser, TenantInfo } from '../common/request';
import { AssessmentsQuery, CreateAssessmentDto, DateQuery, SaveAttendanceDto, SaveGradesDto } from './teaching.dto';
import { TeachingService } from './teaching.service';

/**
 * Espace enseignant. Les permissions ci-dessous laissent entrer enseignants, surveillants et direction ;
 * le service vérifie ensuite, classe par classe et matière par matière, ce que chacun peut faire.
 */
@Controller('teaching')
export class TeachingController {
  constructor(private readonly teaching: TeachingService) {}

  @Get('classes')
  @RequirePermission('teaching.access')
  classes(@TenantDb() db: TenantPrisma, @CurrentTenant() tenant: TenantInfo, @CurrentUser() user: AuthUser) {
    return this.teaching.myClasses(db, tenant, user.id);
  }

  @Get('classes/:id')
  @RequirePermission('teaching.access')
  classDetail(
    @TenantDb() db: TenantPrisma,
    @CurrentTenant() tenant: TenantInfo,
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.teaching.classDetail(db, tenant, user.id, id);
  }

  @Get('classes/:id/attendance')
  @RequirePermission('teaching.access')
  attendance(
    @TenantDb() db: TenantPrisma,
    @CurrentTenant() tenant: TenantInfo,
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() q: DateQuery,
  ) {
    return this.teaching.getAttendance(db, tenant, user.id, id, q.date);
  }

  @Post('classes/:id/attendance')
  @RequirePermission('teaching.access')
  saveAttendance(
    @TenantDb() db: TenantPrisma,
    @CurrentTenant() tenant: TenantInfo,
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SaveAttendanceDto,
  ) {
    return this.teaching.saveAttendance(db, tenant, user.id, id, dto);
  }

  @Get('classes/:id/assessments')
  @RequirePermission('teaching.access')
  assessments(
    @TenantDb() db: TenantPrisma,
    @CurrentTenant() tenant: TenantInfo,
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() q: AssessmentsQuery,
  ) {
    return this.teaching.listAssessments(db, tenant, user.id, id, q.subjectId);
  }

  @Post('assessments')
  @RequirePermission('teaching.access')
  createAssessment(
    @TenantDb() db: TenantPrisma,
    @CurrentTenant() tenant: TenantInfo,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateAssessmentDto,
  ) {
    return this.teaching.createAssessment(db, tenant, user.id, dto);
  }

  @Get('assessments/:id')
  @RequirePermission('teaching.access')
  assessment(
    @TenantDb() db: TenantPrisma,
    @CurrentTenant() tenant: TenantInfo,
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.teaching.getAssessment(db, tenant, user.id, id);
  }

  @Put('assessments/:id/grades')
  @RequirePermission('teaching.access')
  saveGrades(
    @TenantDb() db: TenantPrisma,
    @CurrentTenant() tenant: TenantInfo,
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SaveGradesDto,
  ) {
    return this.teaching.saveGrades(db, tenant, user.id, id, dto);
  }
}
