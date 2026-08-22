import { IsIn, IsOptional, IsString, Length } from 'class-validator';

export class CreateBindingSessionDto {
  @IsString()
  @Length(8, 128)
  requestId!: string;

  @IsString()
  serverCode!: string;

  @IsString()
  gameCode!: string;

  @IsString()
  @Length(1, 32)
  platform!: string;

  @IsString()
  @Length(1, 128)
  gameUserId!: string;

  @IsOptional()
  @IsString()
  @Length(1, 128)
  displayName?: string;

  @IsIn(['register_new', 'bind_existing'])
  bindMode!: string;
}
