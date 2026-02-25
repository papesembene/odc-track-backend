import { IsEmail, IsEnum, IsString } from 'class-validator';
import { ROLE } from '@prisma/client';

export class CreateUserDto {
  @IsString()
  nom: string;

  @IsString()
  prenom: string;

  @IsEmail()
  email: string;

  /**
   * On exclut APPRENANT car les apprenants
   * sont créés uniquement via l'import Excel
   */
  @IsEnum([ROLE.ADMIN, ROLE.POLE_EMPLOI, ROLE.MANAGER, ROLE.COACH], {
    message: 'Role invalide. Les apprenants sont créés via import Excel',
  })
  role: ROLE;
}
