import { IsString, Length } from 'class-validator';

export class ValidateInvitationDto {
  @IsString()
  @Length(4, 64)
  code!: string;
}
