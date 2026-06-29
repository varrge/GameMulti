import { IsIn } from 'class-validator';

export class UpdateGameServerStatusDto {
  @IsIn(['pending', 'active', 'disabled', 'blocked'])
  status!: string;
}
