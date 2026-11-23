import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class DateQuery {
  @IsDateString()
  date: string;
}

export class AttendanceLineDto {
  @IsUUID()
  studentId: string;

  @IsIn(['PRESENT', 'ABSENT', 'RETARD'])
  status: 'PRESENT' | 'ABSENT' | 'RETARD';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(600)
  minutesLate?: number;
}

export class SaveAttendanceDto {
  @IsDateString()
  date: string;

  @IsArray()
  @ArrayMaxSize(300)
  @ValidateNested({ each: true })
  @Type(() => AttendanceLineDto)
  records: AttendanceLineDto[];

  /** Prévenir les parents des nouveaux absents par SMS. */
  @IsOptional()
  @IsBoolean()
  notifyParents?: boolean;
}

export class AssessmentsQuery {
  @IsOptional()
  @IsUUID()
  subjectId?: string;
}

export class CreateAssessmentDto {
  @IsUUID()
  classroomId: string;

  @IsUUID()
  subjectId: string;

  @IsIn(['INTERROGATION', 'DEVOIR', 'COMPOSITION', 'EXAMEN'])
  type: 'INTERROGATION' | 'DEVOIR' | 'COMPOSITION' | 'EXAMEN';

  @IsString()
  @Length(1, 80)
  title: string;

  @IsDateString()
  date: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(200)
  maxScore?: number;
}

export class GradeLineDto {
  @IsUUID()
  studentId: string;

  @IsIn(['NOTE', 'ABSENT_JUSTIFIE', 'ABSENT_NON_JUSTIFIE', 'DISPENSE'])
  status: 'NOTE' | 'ABSENT_JUSTIFIE' | 'ABSENT_NON_JUSTIFIE' | 'DISPENSE';

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  score?: number | null;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  comment?: string;
}

export class SaveGradesDto {
  @IsArray()
  @ArrayMaxSize(300)
  @ValidateNested({ each: true })
  @Type(() => GradeLineDto)
  grades: GradeLineDto[];
}
