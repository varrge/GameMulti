import { IsString, Length } from 'class-validator';

export class FindBindingByTokenDto {
  @IsString()
  @Length(16, 256)
  token!: string;
}
