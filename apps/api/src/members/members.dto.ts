import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';

/** Rôles qu'un directeur peut attribuer. PROMOTEUR : réservé à l'administration FATI. ELEVE : plus tard. */
export const ASSIGNABLE_ROLES = [
  'DIRECTEUR',
  'CENSEUR',
  'SECRETAIRE',
  'COMPTABLE',
  'CAISSIER',
  'ENSEIGNANT',
  'SURVEILLANT',
  'PARENT',
  'BIBLIOTHECAIRE',
  'RESPONSABLE_TRANSPORT',
  'RESPONSABLE_CANTINE',
  'RESPONSABLE_INTERNAT',
] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export class CreateMemberDto {
  @IsString()
  @Length(1, 80)
  firstName: string;

  @IsString()
  @Length(1, 80)
  lastName: string;

  @IsString()
  @MaxLength(25)
  phone: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  @IsIn(ASSIGNABLE_ROLES, { each: true })
  roles: AssignableRole[];

  /** Pour un parent : les élèves dont il est responsable. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  studentIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(40)
  relationship?: string;

  /** Pour le personnel : fonction affichée (ex. « Professeur de mathématiques »). */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  position?: string;
}

export class UpdateMemberDto {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  @IsIn(ASSIGNABLE_ROLES, { each: true })
  roles?: AssignableRole[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
