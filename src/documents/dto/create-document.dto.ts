import { DOCTYPE } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

export class CreateDocumentDto {
  @IsEnum(DOCTYPE)
  type: DOCTYPE;

  // Les documents de situation exigent un situationId.
  // Le CV global est gere par un endpoint dedie sans situation.
  @IsOptional()
  @IsUUID()
  situationId?: string;
}
