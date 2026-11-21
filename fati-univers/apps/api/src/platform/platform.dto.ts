import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsString, Length, MaxLength, ValidateNested } from 'class-validator';

export const CYCLES = ['MATERNELLE', 'PRIMAIRE', 'COLLEGE', 'LYCEE', 'SUPERIEUR', 'FORMATION_PRO'] as const;

export class PersonDto {
  @IsString()
  @Length(1, 80)
  firstName: string;

  @IsString()
  @Length(1, 80)
  lastName: string;

  @IsString()
  @MaxLength(25)
  phone: string;
}

export class CreateSchoolDto {
  @IsString()
  @Length(3, 120)
  name: string;

  /** Nom court affiché comme expéditeur des SMS (11 caractères max). */
  @IsString()
  @Length(2, 11)
  shortName: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(25)
  phone?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  @IsIn(CYCLES, { each: true })
  cycles: (typeof CYCLES)[number][];

  @ValidateNested()
  @Type(() => PersonDto)
  director: PersonDto;
}

export class SchoolStatusDto {
  @IsIn(['ACTIF', 'SUSPENDU'])
  status: 'ACTIF' | 'SUSPENDU';
}
