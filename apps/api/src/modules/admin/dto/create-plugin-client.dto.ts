import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class CreatePluginClientDto {
  @IsString()
  @Length(1, 128)
  serverCode!: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  pluginVersion?: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  protocolVersion?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(24 * 30)
  expiresInHours?: number;
}
