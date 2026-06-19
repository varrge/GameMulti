import { IsString, Length } from 'class-validator';

export class FindBindingByPairCodeDto {
  @IsString()
  @Length(6, 8)
  pairCode!: string;
}
