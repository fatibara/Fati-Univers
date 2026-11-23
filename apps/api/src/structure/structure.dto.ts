import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, Matches, Min } from 'class-validator';

export const CYCLES = ['MATERNELLE', 'PRIMAIRE', 'COLLEGE', 'LYCEE', 'SUPERIEUR', 'FORMATION_PRO'] as const;
export type CycleValue = (typeof CYCLES)[number];

export class CreateYearDto {
  @IsString()
  @Matches(/^\d{4}-\d{4}$/, { message: 'Format attendu : 2026-2027' })
  label: string;

  @IsDateString()
  startsOn: string;

  @IsDateString()
  endsOn: string;

  @IsIn(['TRIMESTRE', 'SEMESTRE'])
  periodType: 'TRIMESTRE' | 'SEMESTRE';

  /** Recopier les classes (et leurs professeurs) de l'année précédente. */
  @IsOptional()
  @IsBoolean()
  copyClasses?: boolean;
}

export class CreateLevelDto {
  @IsString()
  @Length(1, 40)
  name: string;

  @IsIn(CYCLES)
  cycle: CycleValue;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(100)
  gradeScale?: number;
}

export class CreateClassroomDto {
  @IsString()
  @Length(1, 40)
  name: string;

  @IsUUID()
  levelId: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  capacity?: number;

  @IsOptional()
  @IsUUID()
  mainTeacherId?: string;
}

export class UpdateClassroomDto {
  @IsOptional()
  @IsString()
  @Length(1, 40)
  name?: string;

  /** null = retirer le professeur principal. */
  @IsOptional()
  @IsUUID()
  mainTeacherId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  capacity?: number;
}

export class CreateSubjectDto {
  @IsString()
  @Matches(/^[A-Za-z0-9-]{1,10}$/, { message: 'Code court : lettres et chiffres, 10 caractères maximum' })
  code: string;

  @IsString()
  @Length(1, 60)
  name: string;
}

export class SetAssignmentDto {
  @IsUUID()
  classroomId: string;

  @IsUUID()
  subjectId: string;

  /** null = plus de professeur pour cette matière dans cette classe. */
  @IsOptional()
  @IsUUID()
  staffId?: string | null;
}

export class QuickStartDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  @IsIn(['MATERNELLE', 'PRIMAIRE', 'COLLEGE', 'LYCEE'], { each: true })
  cycles: ('MATERNELLE' | 'PRIMAIRE' | 'COLLEGE' | 'LYCEE')[];
}
