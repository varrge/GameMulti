import { Type } from 'class-transformer';
import { IsBoolean, IsISO8601, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class RecordServerHeartbeatDto {
  @IsString()
  @MaxLength(128)
  statusId!: string;

  @IsString()
  @MaxLength(128)
  serverCode!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  serverId?: string;

  @IsBoolean()
  healthy!: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  onlineCount!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  queueDepth!: number;

  @IsISO8601()
  sentAt!: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
