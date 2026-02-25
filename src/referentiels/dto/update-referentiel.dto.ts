import { PartialType } from '@nestjs/mapped-types';
import { CreateReferentielDto } from './create-referentiel.dto';

export class UpdateReferentielDto extends PartialType(CreateReferentielDto) {}
