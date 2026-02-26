import { DOCTYPE } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class CreateDocumentDto {
  @IsEnum(DOCTYPE)
  type: DOCTYPE;
}
