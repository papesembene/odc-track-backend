-- CreateEnum
CREATE TYPE "ROLE" AS ENUM ('ADMIN', 'COACH', 'POLE_EMPLOI', 'APPRENANT', 'MANAGER');

-- CreateEnum
CREATE TYPE "STATUT" AS ENUM ('RECHERCHE_EMPLOI', 'EN_STAGE', 'EN_EMPLOI', 'PROJET_PERSO', 'POURSUITE_ETUDES');

-- CreateEnum
CREATE TYPE "DOCTYPE" AS ENUM ('CONTRAT', 'ATTESTATION', 'LETTRE_MISSION', 'CV', 'AUTRE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "motDePasse" TEXT NOT NULL,
    "role" "ROLE" NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Apprenant" (
    "id" TEXT NOT NULL,
    "telephone" TEXT,
    "dateNaissance" TIMESTAMP(3),
    "genre" TEXT NOT NULL,
    "adresse" TEXT NOT NULL,
    "motDePasseTemporaire" BOOLEAN NOT NULL DEFAULT true,
    "datePremiereConnexion" TIMESTAMP(3),
    "userId" TEXT NOT NULL,
    "referentielId" TEXT NOT NULL,
    "promotionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Apprenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coach" (
    "id" TEXT NOT NULL,
    "specialite" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "referentielId" TEXT NOT NULL,

    CONSTRAINT "Coach_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Referentiel" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Referentiel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Promotion" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "annee" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "estActive" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromotionReferentiel" (
    "promotionId" TEXT NOT NULL,
    "referentielId" TEXT NOT NULL,

    CONSTRAINT "PromotionReferentiel_pkey" PRIMARY KEY ("promotionId","referentielId")
);

-- CreateTable
CREATE TABLE "SituationProfessionnelle" (
    "id" TEXT NOT NULL,
    "statut" "STATUT" NOT NULL,
    "dateDebut" TIMESTAMP(3) NOT NULL,
    "dateFin" TIMESTAMP(3),
    "commentaire" TEXT,
    "valide" BOOLEAN NOT NULL DEFAULT false,
    "dateValidation" TIMESTAMP(3),
    "apprenantId" TEXT NOT NULL,
    "entrepriseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "adresseEntrepriseLibre" TEXT,
    "nomEntrepriseLibre" TEXT,
    "secteurEntrepriseLibre" TEXT,

    CONSTRAINT "SituationProfessionnelle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entreprise" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "secteur" TEXT,
    "adresse" TEXT,
    "telephone" TEXT,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Entreprise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "type" "DOCTYPE" NOT NULL,
    "fichier" TEXT NOT NULL,
    "dateUpload" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "apprenantId" TEXT NOT NULL,
    "situationId" TEXT,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_createdAt_idx" ON "User"("role", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Apprenant_userId_key" ON "Apprenant"("userId");

-- CreateIndex
CREATE INDEX "Apprenant_promotionId_createdAt_idx" ON "Apprenant"("promotionId", "createdAt");

-- CreateIndex
CREATE INDEX "Apprenant_referentielId_createdAt_idx" ON "Apprenant"("referentielId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Coach_userId_key" ON "Coach"("userId");

-- CreateIndex
CREATE INDEX "Coach_referentielId_idx" ON "Coach"("referentielId");

-- CreateIndex
CREATE INDEX "Promotion_estActive_idx" ON "Promotion"("estActive");

-- CreateIndex
CREATE INDEX "SituationProfessionnelle_apprenantId_dateDebut_idx" ON "SituationProfessionnelle"("apprenantId", "dateDebut");

-- CreateIndex
CREATE INDEX "SituationProfessionnelle_valide_createdAt_idx" ON "SituationProfessionnelle"("valide", "createdAt");

-- CreateIndex
CREATE INDEX "SituationProfessionnelle_statut_apprenantId_idx" ON "SituationProfessionnelle"("statut", "apprenantId");

-- CreateIndex
CREATE INDEX "Document_apprenantId_createdAt_idx" ON "Document"("apprenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Document_situationId_createdAt_idx" ON "Document"("situationId", "createdAt");

-- AddForeignKey
ALTER TABLE "Apprenant" ADD CONSTRAINT "Apprenant_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Apprenant" ADD CONSTRAINT "Apprenant_referentielId_fkey" FOREIGN KEY ("referentielId") REFERENCES "Referentiel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Apprenant" ADD CONSTRAINT "Apprenant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coach" ADD CONSTRAINT "Coach_referentielId_fkey" FOREIGN KEY ("referentielId") REFERENCES "Referentiel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coach" ADD CONSTRAINT "Coach_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionReferentiel" ADD CONSTRAINT "PromotionReferentiel_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionReferentiel" ADD CONSTRAINT "PromotionReferentiel_referentielId_fkey" FOREIGN KEY ("referentielId") REFERENCES "Referentiel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SituationProfessionnelle" ADD CONSTRAINT "SituationProfessionnelle_apprenantId_fkey" FOREIGN KEY ("apprenantId") REFERENCES "Apprenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SituationProfessionnelle" ADD CONSTRAINT "SituationProfessionnelle_entrepriseId_fkey" FOREIGN KEY ("entrepriseId") REFERENCES "Entreprise"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_apprenantId_fkey" FOREIGN KEY ("apprenantId") REFERENCES "Apprenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_situationId_fkey" FOREIGN KEY ("situationId") REFERENCES "SituationProfessionnelle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
