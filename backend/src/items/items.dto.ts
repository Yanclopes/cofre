import { IsInt, Matches, MaxLength, Min } from 'class-validator';
import { ENC_STRING_REGEX, MAX_ITEM_LENGTH } from '../common/enc-string';

export class CreateItemDto {
  @MaxLength(MAX_ITEM_LENGTH)
  @Matches(ENC_STRING_REGEX, { message: 'data precisa estar cifrado (formato v1)' })
  data: string;
}

export class UpdateItemDto extends CreateItemDto {
  @IsInt()
  @Min(1)
  revision: number;
}
