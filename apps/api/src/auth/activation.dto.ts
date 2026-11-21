import { IsString, Length, Matches, MaxLength } from 'class-validator';

export class ActivateDto {
  @IsString()
  @MaxLength(25)
  phone: string;

  @Matches(/^\d{6}$/, { message: 'Le code contient 6 chiffres' })
  code: string;

  @IsString()
  @Length(8, 128, { message: 'Le mot de passe doit contenir au moins 8 caractères' })
  password: string;
}

export class RequestCodeDto {
  @IsString()
  @MaxLength(25)
  phone: string;
}
