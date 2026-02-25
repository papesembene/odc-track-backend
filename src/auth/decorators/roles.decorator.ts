// Roles decorator → permet d'annoter les routes avec les rôles autorisés
import { SetMetadata } from '@nestjs/common';
import { ROLE } from '@prisma/client';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: ROLE[]) => SetMetadata(ROLES_KEY, roles);
