import {
  DOCTYPE,
  PrismaClient,
  ROLE,
  STATUT,
  type Promotion,
  type Referentiel,
  type Entreprise,
  type User,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const defaultPassword = 'Admin@1234';

async function upsertUser(data: {
  email: string;
  nom: string;
  prenom: string;
  role: ROLE;
  actif?: boolean;
}) {
  const hashedPassword = await bcrypt.hash(defaultPassword, 10);

  return prisma.user.upsert({
    where: { email: data.email },
    update: {
      nom: data.nom,
      prenom: data.prenom,
      role: data.role,
      actif: data.actif ?? true,
    },
    create: {
      nom: data.nom,
      prenom: data.prenom,
      email: data.email,
      motDePasse: hashedPassword,
      role: data.role,
      actif: data.actif ?? true,
    },
  });
}

async function ensureReferentiel(nom: string, description: string) {
  const existing = await prisma.referentiel.findFirst({ where: { nom } });
  if (existing) {
    return prisma.referentiel.update({
      where: { id: existing.id },
      data: { description },
    });
  }

  return prisma.referentiel.create({
    data: { nom, description },
  });
}

async function ensurePromotion(
  nom: string,
  annee: number,
  estActive = false,
): Promise<Promotion> {
  const existing = await prisma.promotion.findFirst({
    where: { nom, annee },
  });

  if (existing) {
    return prisma.promotion.update({
      where: { id: existing.id },
      data: { estActive },
    });
  }

  return prisma.promotion.create({
    data: { nom, annee, estActive },
  });
}

async function linkPromotionReferentiel(
  promotion: Promotion,
  referentiel: Referentiel,
) {
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
}

async function ensureEntreprise(data: {
  nom: string;
  secteur: string;
  adresse: string;
  telephone: string;
  email: string;
}): Promise<Entreprise> {
  const existing = await prisma.entreprise.findFirst({
    where: { nom: data.nom },
  });

  if (existing) {
    return prisma.entreprise.update({
      where: { id: existing.id },
      data,
    });
  }

  return prisma.entreprise.create({ data });
}

async function ensureCoachProfile(user: User, referentiel: Referentiel) {
  return prisma.coach.upsert({
    where: { userId: user.id },
    update: {
      referentielId: referentiel.id,
      specialite: `Coach ${referentiel.nom}`,
    },
    create: {
      userId: user.id,
      referentielId: referentiel.id,
      specialite: `Coach ${referentiel.nom}`,
    },
  });
}

async function ensureApprenantProfile(data: {
  user: User;
  referentiel: Referentiel;
  promotion: Promotion;
  genre: string;
  adresse: string;
  telephone: string;
  dateNaissance: Date;
}) {
  return prisma.apprenant.upsert({
    where: { userId: data.user.id },
    update: {
      referentielId: data.referentiel.id,
      promotionId: data.promotion.id,
      genre: data.genre,
      adresse: data.adresse,
      telephone: data.telephone,
      dateNaissance: data.dateNaissance,
      motDePasseTemporaire: false,
      datePremiereConnexion: new Date(),
    },
    create: {
      userId: data.user.id,
      referentielId: data.referentiel.id,
      promotionId: data.promotion.id,
      genre: data.genre,
      adresse: data.adresse,
      telephone: data.telephone,
      dateNaissance: data.dateNaissance,
      motDePasseTemporaire: false,
      datePremiereConnexion: new Date(),
    },
  });
}

async function ensureSituation(data: {
  apprenantId: string;
  statut: STATUT;
  dateDebut: Date;
  dateFin?: Date | null;
  commentaire: string;
  valide: boolean;
  entrepriseId?: string | null;
  nomEntrepriseLibre?: string | null;
  secteurEntrepriseLibre?: string | null;
  adresseEntrepriseLibre?: string | null;
}) {
  const existing = await prisma.situationProfessionnelle.findFirst({
    where: {
      apprenantId: data.apprenantId,
      statut: data.statut,
      commentaire: data.commentaire,
    },
  });

  const payload = {
    apprenantId: data.apprenantId,
    statut: data.statut,
    dateDebut: data.dateDebut,
    dateFin: data.dateFin ?? null,
    commentaire: data.commentaire,
    valide: data.valide,
    dateValidation: data.valide ? new Date() : null,
    entrepriseId: data.entrepriseId ?? null,
    nomEntrepriseLibre: data.nomEntrepriseLibre ?? null,
    secteurEntrepriseLibre: data.secteurEntrepriseLibre ?? null,
    adresseEntrepriseLibre: data.adresseEntrepriseLibre ?? null,
  };

  if (existing) {
    return prisma.situationProfessionnelle.update({
      where: { id: existing.id },
      data: payload,
    });
  }

  return prisma.situationProfessionnelle.create({
    data: payload,
  });
}

async function ensureDocument(data: {
  apprenantId: string;
  situationId?: string | null;
  type: DOCTYPE;
  fichier: string;
}) {
  const existing = await prisma.document.findFirst({
    where: {
      apprenantId: data.apprenantId,
      situationId: data.situationId ?? null,
      type: data.type,
      fichier: data.fichier,
    },
  });

  if (existing) {
    return existing;
  }

  return prisma.document.create({
    data: {
      apprenantId: data.apprenantId,
      situationId: data.situationId ?? null,
      type: data.type,
      fichier: data.fichier,
    },
  });
}

async function main() {
  // Une seule promotion doit rester active.
  await prisma.promotion.updateMany({
    data: { estActive: false },
  });

  // Comptes staff de base pour tester les roles et le login.
  const admin = await upsertUser({
    email: 'admin@odc.com',
    nom: 'Admin',
    prenom: 'ODC',
    role: ROLE.ADMIN,
  });
  const manager = await upsertUser({
    email: 'manager@odc.com',
    nom: 'Ndiaye',
    prenom: 'Moussa',
    role: ROLE.MANAGER,
  });
  const poleEmploi = await upsertUser({
    email: 'pole-emploi@odc.com',
    nom: 'Sarr',
    prenom: 'Fatou',
    role: ROLE.POLE_EMPLOI,
  });

  // Referentiels utilises par les promotions, coaches et apprenants.
  const aws = await ensureReferentiel('AWS', 'Cloud et administration AWS');
  const web = await ensureReferentiel(
    'Développement Web',
    'Frontend et backend web',
  );
  const data = await ensureReferentiel(
    'Data IA',
    'Data analyse et intelligence',
  );

  // Promotions de test. Les noms restent neutres car une promotion peut
  // regrouper plusieurs referentiels.
  const promo1 = await ensurePromotion('Promotion 1', 2026, true);
  const promo2 = await ensurePromotion('Promotion 2', 2026, false);
  const promo2025 = await ensurePromotion('Promotion 2025', 2025, false);

  await linkPromotionReferentiel(promo1, aws);
  await linkPromotionReferentiel(promo2, web);
  await linkPromotionReferentiel(promo2025, data);
  await linkPromotionReferentiel(promo2, aws);

  // Entreprises partenaires minimales pour les situations.
  const sonatel = await ensureEntreprise({
    nom: 'Sonatel',
    secteur: 'Telecom',
    adresse: 'Vdn, Dakar',
    telephone: '338000001',
    email: 'contact@sonatel.sn',
  });
  const gainde = await ensureEntreprise({
    nom: 'Gainde 2000',
    secteur: 'Numerique',
    adresse: 'Plateau, Dakar',
    telephone: '338000002',
    email: 'contact@gainde2000.sn',
  });

  // Coaches relies a un referentiel.
  const coachAwsUser = await upsertUser({
    email: 'coach.aws@odc.com',
    nom: 'Ba',
    prenom: 'Ibrahima',
    role: ROLE.COACH,
  });
  const coachWebUser = await upsertUser({
    email: 'coach.web@odc.com',
    nom: 'Faye',
    prenom: 'Aminata',
    role: ROLE.COACH,
  });
  await ensureCoachProfile(coachAwsUser, aws);
  await ensureCoachProfile(coachWebUser, web);

  // Apprenants de test repartis sur plusieurs promotions/referentiels.
  const awaUser = await upsertUser({
    email: 'apprenant.awa@odc.com',
    nom: 'Diallo',
    prenom: 'Awa',
    role: ROLE.APPRENANT,
  });
  const cheikhUser = await upsertUser({
    email: 'apprenant.cheikh@odc.com',
    nom: 'Ndiaye',
    prenom: 'Cheikh',
    role: ROLE.APPRENANT,
  });
  const mariamaUser = await upsertUser({
    email: 'apprenant.mariama@odc.com',
    nom: 'Sow',
    prenom: 'Mariama',
    role: ROLE.APPRENANT,
  });
  const ousmaneUser = await upsertUser({
    email: 'apprenant.ousmane@odc.com',
    nom: 'Seck',
    prenom: 'Ousmane',
    role: ROLE.APPRENANT,
  });

  const awa = await ensureApprenantProfile({
    user: awaUser,
    referentiel: aws,
    promotion: promo1,
    genre: 'F',
    adresse: 'Dakar',
    telephone: '771234567',
    dateNaissance: new Date('1998-04-12'),
  });
  const cheikh = await ensureApprenantProfile({
    user: cheikhUser,
    referentiel: aws,
    promotion: promo1,
    genre: 'M',
    adresse: 'Rufisque',
    telephone: '771111111',
    dateNaissance: new Date('1997-08-23'),
  });
  const mariama = await ensureApprenantProfile({
    user: mariamaUser,
    referentiel: web,
    promotion: promo2,
    genre: 'F',
    adresse: 'Pikine',
    telephone: '772222222',
    dateNaissance: new Date('1999-01-10'),
  });
  const ousmane = await ensureApprenantProfile({
    user: ousmaneUser,
    referentiel: data,
    promotion: promo2025,
    genre: 'M',
    adresse: 'Thiès',
    telephone: '773333333',
    dateNaissance: new Date('1996-11-05'),
  });

  // Situations variees pour tester dashboard, stats, validations et details.
  const awaSituation = await ensureSituation({
    apprenantId: awa.id,
    statut: STATUT.EN_EMPLOI,
    dateDebut: new Date('2026-01-15'),
    commentaire: 'Integratrice cloud chez Sonatel',
    valide: true,
    entrepriseId: sonatel.id,
  });
  const cheikhSituation = await ensureSituation({
    apprenantId: cheikh.id,
    statut: STATUT.EN_STAGE,
    dateDebut: new Date('2026-02-01'),
    dateFin: new Date('2026-07-31'),
    commentaire: 'Stage DevOps en attente de validation',
    valide: false,
    entrepriseId: gainde.id,
  });
  const mariamaSituation = await ensureSituation({
    apprenantId: mariama.id,
    statut: STATUT.RECHERCHE_EMPLOI,
    dateDebut: new Date('2026-02-20'),
    commentaire: 'Recherche active d un poste frontend',
    valide: false,
    nomEntrepriseLibre: 'Startup X',
    secteurEntrepriseLibre: 'Web',
    adresseEntrepriseLibre: 'Mermoz, Dakar',
  });
  const ousmaneSituation = await ensureSituation({
    apprenantId: ousmane.id,
    statut: STATUT.PROJET_PERSO,
    dateDebut: new Date('2025-09-01'),
    commentaire: 'Projet personnel de data visualisation',
    valide: true,
    nomEntrepriseLibre: 'Projet personnel',
    secteurEntrepriseLibre: 'Data',
    adresseEntrepriseLibre: 'Thiès',
  });

  // Quelques documents relies aux situations pour tester les ecrans documents.
  await ensureDocument({
    apprenantId: awa.id,
    situationId: awaSituation.id,
    type: DOCTYPE.CONTRAT,
    fichier: 'seed/awa-contrat.pdf',
  });
  await ensureDocument({
    apprenantId: cheikh.id,
    situationId: cheikhSituation.id,
    type: DOCTYPE.ATTESTATION,
    fichier: 'seed/cheikh-attestation.pdf',
  });
  await ensureDocument({
    apprenantId: mariama.id,
    situationId: mariamaSituation.id,
    type: DOCTYPE.CV,
    fichier: 'seed/mariama-cv.pdf',
  });
  await ensureDocument({
    apprenantId: ousmane.id,
    situationId: ousmaneSituation.id,
    type: DOCTYPE.AUTRE,
    fichier: 'seed/ousmane-projet.pdf',
  });

  console.log('Seed termine avec succes');
  console.log('Comptes de test disponibles:');
  console.log(`- admin@odc.com / ${defaultPassword}`);
  console.log(`- manager@odc.com / ${defaultPassword}`);
  console.log(`- pole-emploi@odc.com / ${defaultPassword}`);
  console.log(`- coach.aws@odc.com / ${defaultPassword}`);
  console.log(`- coach.web@odc.com / ${defaultPassword}`);
  console.log(`- apprenant.awa@odc.com / ${defaultPassword}`);
  console.log(`- apprenant.cheikh@odc.com / ${defaultPassword}`);
  console.log(`- apprenant.mariama@odc.com / ${defaultPassword}`);
  console.log(`- apprenant.ousmane@odc.com / ${defaultPassword}`);

  void admin;
  void manager;
  void poleEmploi;
}

main()
  .catch((error) => {
    console.error('Erreur pendant le seed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
