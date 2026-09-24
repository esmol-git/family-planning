import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateFamilyDto {
  @ApiProperty({ example: 'Семья Ивановых' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional({ example: 15, default: 15 })
  @IsOptional()
  @IsInt()
  @Min(0)
  travelBufferDefault?: number;

  @ApiPropertyOptional({ example: 'Europe/Moscow' })
  @IsOptional()
  @IsString()
  timezone?: string;
}

export class UpdateFamilyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  travelBufferDefault?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  timezone?: string;
}
