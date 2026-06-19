import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class BatchCreateInvitationsDto {
  @IsInt()
  @Min(1)
  @Max(200)
  count!: number;

  @IsInt()
  @Min(1)
  @Max(1000)
  maxUses!: number;

  @IsString()
  createdBy!: string;

  @IsOptional()
  @IsString()
  ownerUserId?: string;

  @IsOptional()
  @IsString()
  batchId?: string;

  @IsOptional()
  @IsString()
  remark?: string;
}
