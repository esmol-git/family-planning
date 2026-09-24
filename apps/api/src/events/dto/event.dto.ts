import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RecurrenceDto {
  @ApiProperty({ enum: ['daily', 'weekly', 'monthly'] })
  @IsEnum(['daily', 'weekly', 'monthly'])
  freq!: 'daily' | 'weekly' | 'monthly';

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  interval?: number;

  @ApiPropertyOptional({
    description: 'Дни недели ISO: 1=пн … 7=вс (для weekly)',
    example: [1, 3, 5],
    type: [Number],
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  byWeekday?: number[];

  @ApiPropertyOptional({ example: '2026-12-31', description: 'Дата окончания YYYY-MM-DD' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  until?: string;
}

export class CreateEventDto {
  @ApiProperty({ example: 'Футбол' })
  @IsString()
  @MinLength(1)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: '2026-09-22T14:00:00.000Z' })
  @IsDateString()
  startsAtUtc!: string;

  @ApiProperty({ example: '2026-09-22T15:00:00.000Z' })
  @IsDateString()
  endsAtUtc!: string;

  @ApiProperty({ example: 'Europe/Moscow' })
  @IsString()
  timezone!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  location?: string;

  @ApiProperty({ example: 'clxxxxxxxx' })
  @IsString()
  categoryId!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  participantIds!: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  responsibleMemberId?: string;

  @ApiPropertyOptional({ example: 15 })
  @IsOptional()
  @IsInt()
  @Min(0)
  travelBufferMinutes?: number;

  @ApiPropertyOptional({ type: RecurrenceDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RecurrenceDto)
  recurrence?: RecurrenceDto;

  @ApiPropertyOptional({
    description: 'Напоминания за N минут до начала',
    example: [15, 60],
    type: [Number],
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(60 * 24 * 30, { each: true })
  reminderMinutes?: number[];

  @ApiPropertyOptional({
    description: 'Подтвердить сохранение при мягких конфликтах (буфер)',
  })
  @IsOptional()
  @IsBoolean()
  confirmConflict?: boolean;
}

export class UpdateEventDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startsAtUtc?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endsAtUtc?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  participantIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  responsibleMemberId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  travelBufferMinutes?: number;

  @ApiPropertyOptional({
    type: RecurrenceDto,
    nullable: true,
    description: 'null — сбросить повторение',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @ValidateNested()
  @Type(() => RecurrenceDto)
  recurrence?: RecurrenceDto | null;

  @ApiPropertyOptional({
    description: 'Напоминания за N минут; пустой массив — сбросить',
    type: [Number],
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(60 * 24 * 30, { each: true })
  reminderMinutes?: number[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  confirmConflict?: boolean;
}

export class CheckConflictsDto {
  @ApiProperty()
  @IsDateString()
  startsAtUtc!: string;

  @ApiProperty()
  @IsDateString()
  endsAtUtc!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  participantIds!: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  responsibleMemberId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  travelBufferMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ type: RecurrenceDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RecurrenceDto)
  recurrence?: RecurrenceDto;
}
