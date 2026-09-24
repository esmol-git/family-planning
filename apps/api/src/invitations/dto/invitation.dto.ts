import {
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateInvitationDto {
  @ApiProperty({ enum: ['adult', 'helper'], example: 'adult' })
  @IsIn(['adult', 'helper'])
  memberType!: 'adult' | 'helper';

  @ApiPropertyOptional({ example: 'Анна' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  invitedName?: string;

  @ApiPropertyOptional({ example: 'anna@example.com' })
  @IsOptional()
  @IsEmail()
  invitedEmail?: string;

  @ApiPropertyOptional({
    description: 'Привязать к существующему участнику без аккаунта',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  targetMemberId?: string;

  @ApiPropertyOptional({ example: '#DB2777' })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/)
  color?: string;

  @ApiPropertyOptional({ example: 7, description: 'Срок жизни в днях (1–30)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  expiresInDays?: number;
}

export class AcceptByCodeDto {
  @ApiProperty({ example: 'AB12CD' })
  @IsString()
  @MinLength(4)
  code!: string;
}
