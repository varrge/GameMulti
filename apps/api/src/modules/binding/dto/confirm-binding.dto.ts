import { IsString } from 'class-validator';

export class ConfirmBindingDto {
  @IsString()
  sessionId!: string;
}
