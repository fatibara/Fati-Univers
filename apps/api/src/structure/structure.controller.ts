import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import type { TenantPrisma } from '../database';
import { CurrentTenant, CurrentUser, RequirePermission, TenantDb } from '../common/decorators';
import type { AuthUser, TenantInfo } from '../common/request';
import {
  CreateClassroomDto,
  CreateLevelDto,
  CreateSubjectDto,
  CreateYearDto,
  QuickStartDto,
  SetAssignmentDto,
  UpdateClassroomDto,
} from './structure.dto';
import { StructureService } from './structure.service';

@Controller('structure')
export class StructureController {
  constructor(private readonly structure: StructureService) {}

  /** Lecture : direction, censeur, secrétariat (pour inscrire les élèves dans une classe). */
  @Get()
  @RequirePermission('students.read')
  overview(@TenantDb() db: TenantPrisma) {
    return this.structure.overview(db);
  }

  @Post('years')
  @RequirePermission('classes.manage')
  createYear(@CurrentTenant() tenant: TenantInfo, @CurrentUser() user: AuthUser, @Body() dto: CreateYearDto) {
    return this.structure.createYear(tenant, user.id, dto);
  }

  @Post('quick-start')
  @RequirePermission('classes.manage')
  quickStart(@TenantDb() db: TenantPrisma, @CurrentTenant() tenant: TenantInfo, @Body() dto: QuickStartDto) {
    return this.structure.quickStart(db, tenant, dto);
  }

  @Post('levels')
  @RequirePermission('classes.manage')
  createLevel(@TenantDb() db: TenantPrisma, @CurrentTenant() tenant: TenantInfo, @Body() dto: CreateLevelDto) {
    return this.structure.createLevel(db, tenant, dto);
  }

  @Post('classrooms')
  @RequirePermission('classes.manage')
  createClassroom(@TenantDb() db: TenantPrisma, @CurrentTenant() tenant: TenantInfo, @Body() dto: CreateClassroomDto) {
    return this.structure.createClassroom(db, tenant, dto);
  }

  @Patch('classrooms/:id')
  @RequirePermission('classes.manage')
  updateClassroom(@TenantDb() db: TenantPrisma, @Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateClassroomDto) {
    return this.structure.updateClassroom(db, id, dto);
  }

  @Delete('classrooms/:id')
  @RequirePermission('classes.manage')
  deleteClassroom(@TenantDb() db: TenantPrisma, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.structure.deleteClassroom(db, id);
  }

  @Post('subjects')
  @RequirePermission('classes.manage')
  createSubject(@TenantDb() db: TenantPrisma, @CurrentTenant() tenant: TenantInfo, @Body() dto: CreateSubjectDto) {
    return this.structure.createSubject(db, tenant, dto);
  }

  @Put('assignments')
  @RequirePermission('classes.manage')
  setAssignment(@TenantDb() db: TenantPrisma, @CurrentTenant() tenant: TenantInfo, @Body() dto: SetAssignmentDto) {
    return this.structure.setAssignment(db, tenant, dto);
  }
}
