import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';
import { ROLE } from '@prisma/client';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  nom?: string;

  @IsOptional()
  @IsString()
  prenom?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsEnum([ROLE.ADMIN, ROLE.POLE_EMPLOI, ROLE.MANAGER, ROLE.COACH], {
    message: 'Role invalide. Les apprenants sont créés via import Excel',
  })
  role?: ROLE;
}
