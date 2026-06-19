import { IsISO8601, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class RecordPluginEventDto {
  @IsString()
  @MaxLength(128)
  eventId!: string;

  @IsString()
  @MaxLength(128)
  serverCode!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  serverId?: string;

  @IsString()
  @MaxLength(64)
  eventType!: string;

  @IsString()
  @MaxLength(128)
  playerUuid!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  displayName?: string;

  @IsISO8601()
  occurredAt!: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
