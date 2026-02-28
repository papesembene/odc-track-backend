import { DOCTYPE } from '@prisma/client';
import { IsEnum, IsUUID } from 'class-validator';

export class CreateDocumentDto {
  @IsEnum(DOCTYPE)
  type: DOCTYPE;

  @IsUUID()
  situationId: string;
}
