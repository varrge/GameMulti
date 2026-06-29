import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class ClaimPluginInstallationDto {
  @IsString()
  @Length(16, 256)
  installToken!: string;

  @IsOptional()
  @IsString()
  @Length(1, 128)
  serverCode?: string;

  @IsString()
  @Length(1, 128)
  serverName!: string;

  @IsOptional()
  @IsString()
  @Length(1, 128)
  publicHost?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  publicPort?: number;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  pluginVersion?: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  protocolVersion?: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  region?: string;
}
