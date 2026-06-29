import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class CreatePluginInstallTokenDto {
  @IsOptional()
  @IsString()
  @Length(1, 64)
  gameCode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24 * 30)
  expiresInHours?: number;
}
