import { PrismaClient, ROLE } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // Mot de passe de test commun pour les comptes seed
  const hashedPassword = await bcrypt.hash('Admin@1234', 10);

  // 1) Créer un admin
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

  // 2) Préparer un référentiel et une promotion de test
  let referentiel = await prisma.referentiel.findFirst({
    where: { nom: 'AWS' },
  });
  if (!referentiel) {
    referentiel = await prisma.referentiel.create({
      data: {
        nom: 'AWS',
        description: 'Cloud AWS',
      },
    });
  }

  let promotion = await prisma.promotion.findFirst({
    where: { nom: 'Promotion AWS 2026', annee: 2026 },
  });
  if (!promotion) {
    promotion = await prisma.promotion.create({
      data: {
        nom: 'Promotion AWS 2026',
        annee: 2026,
      },
    });
  }

  await prisma.promotionReferentiel.upsert({
    where: {
      promotionId_referentielId: {
        promotionId: promotion.id,
        referentielId: referentiel.id,
      },
    },
    update: {},
    create: {
      promotionId: promotion.id,
      referentielId: referentiel.id,
    },
  });

  // 3) Créer un user APPRENANT de test
  const apprenantUser = await prisma.user.upsert({
    where: { email: 'apprenant.test@odc.com' },
    update: {},
    create: {
      nom: 'Diallo',
      prenom: 'Awa',
      email: 'apprenant.test@odc.com',
      motDePasse: hashedPassword,
      role: ROLE.APPRENANT,
      actif: true,
    },
  });

  // 4) Créer le profil apprenant lié au user
  await prisma.apprenant.upsert({
    where: { userId: apprenantUser.id },
    update: {},
    create: {
      userId: apprenantUser.id,
      promotionId: promotion.id,
      referentielId: referentiel.id,
      genre: 'F',
      adresse: 'Dakar',
      telephone: '771234567',
    },
  });

  console.log('Seed terminé avec succès');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
