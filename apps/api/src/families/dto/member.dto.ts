import { IsBoolean, IsEnum, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MemberRelation, MemberType } from '@prisma/client';

export class CreateMemberDto {
  @ApiProperty({ example: 'Миша' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ example: '#16A34A' })
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/)
  color!: string;

  @ApiProperty({ enum: MemberType, example: MemberType.child })
  @IsEnum(MemberType)
  type!: MemberType;

  @ApiPropertyOptional({ enum: MemberRelation, example: MemberRelation.son })
  @IsOptional()
  @IsEnum(MemberRelation)
  relation?: MemberRelation;
}

export class UpdateMemberDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/)
  color?: string;

  @ApiPropertyOptional({ enum: MemberType })
  @IsOptional()
  @IsEnum(MemberType)
  type?: MemberType;

  @ApiPropertyOptional({ enum: MemberRelation })
  @IsOptional()
  @IsEnum(MemberRelation)
  relation?: MemberRelation;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
