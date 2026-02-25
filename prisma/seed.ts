import { PrismaClient, ROLE } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // Créer un admin
  const hashedPassword = await bcrypt.hash('Admin@1234', 10);

  await prisma.user.upsert({
    where: { email: 'admin@odc.com' },
    update: {},
    create: {
      nom: 'Admin',
      prenom: 'ODC',
      email: 'admin@odc.com',
      motDePasse: hashedPassword,
      role: ROLE.ADMIN,
      actif: true,
    },
  });

  console.log('Seed terminé avec succès');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
