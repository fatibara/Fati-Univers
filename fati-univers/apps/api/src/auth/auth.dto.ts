import { IsString, Length, MaxLength } from 'class-validator';

export class LoginDto {
  /** Numéro au format local ou international : "620 12 34 56" ou "+224620123456". */
  @IsString()
  @MaxLength(25)
  phone: string;

  @IsString()
  @Length(8, 128)
  password: string;
}

export class RefreshDto {
  @IsString()
  @Length(40, 200)
  refreshToken: string;
}
