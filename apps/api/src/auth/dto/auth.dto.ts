import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'ekaterina', description: 'Логин для входа' })
  @IsString()
  @MinLength(3)
  @Matches(/^[a-zA-Z0-9._-]+$/, {
    message: 'Логин: латиница, цифры, точка, _ или -',
  })
  login!: string;

  @ApiProperty({ example: 'Екатерина' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional({ example: 'katya@example.com' })
  @IsOptional()
  @ValidateIf((_, v) => v != null && v !== '')
  @IsEmail()
  email?: string;

  @ApiProperty({ example: 'password123', minLength: 6 })
  @IsString()
  @MinLength(6)
  password!: string;
}

export class LoginDto {
  @ApiProperty({ example: 'ekaterina', description: 'Логин или email' })
  @IsString()
  @MinLength(1)
  login!: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  @MinLength(6)
  password!: string;
}

export class RefreshDto {
  @ApiProperty({ description: 'Refresh token, полученный при login/register' })
  @IsString()
  @MinLength(20)
  refreshToken!: string;
}

export class LogoutDto {
  @ApiPropertyOptional({ description: 'Конкретный refresh — иначе отзовутся все сессии' })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'demo@family.local' })
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: 'Токен из письма / ссылки сброса' })
  @IsString()
  @MinLength(20)
  token!: string;

  @ApiProperty({ example: 'newpassword', minLength: 6 })
  @IsString()
  @MinLength(6)
  newPassword!: string;
}

export class ChangePasswordDto {
  @ApiProperty({ minLength: 6 })
  @IsString()
  @MinLength(6)
  currentPassword!: string;

  @ApiProperty({ minLength: 6 })
  @IsString()
  @MinLength(6)
  newPassword!: string;
}
