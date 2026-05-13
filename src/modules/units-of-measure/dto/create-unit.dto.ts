import { IsString, IsNotEmpty } from 'class-validator';

export class CreateUnitDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  symbol: string;
}
