import { ROLE } from '@prisma/client';
export type JwtPayload = {
  sub: string;
  email: string;
  role: ROLE;
};
