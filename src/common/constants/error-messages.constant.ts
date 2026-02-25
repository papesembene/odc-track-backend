export const AUTH_ERROR = {
  INVALID_CREDENTIALS: {
    code: 'AUTH_INVALID_CREDENTIALS',
    message: 'Email ou mot de passe incorrect',
  },
  INVALID_PASSWORD: {
    code: 'AUTH_INVALID_PASSWORD',
    message: 'mot de passe incorrect',
  },
  UNAUTHORIZED: {
    code: 'AUTH_UNAUTHORIZED',
    message: 'Non autorisé',
  },
  USER_INACTIVE: {
    code: 'AUTH_USER_INACTIVE',
    message: 'Compte désactivé',
  },
};

export const USER_ERRORS = {
  NOT_FOUND: {
    code: 'USER_NOT_FOUND',
    message: 'Utilisateur introuvable',
  },
  EMAIL_EXISTS: {
    code: 'USER_EMAIL_EXISTS',
    message: 'Cet email existe déjà',
  },
  FORBIDDEN: {
    code: 'USER_FORBIDDEN',
    message: 'Accès refusé',
  },
};

export const REFERENTIELS_ERRORS = {
  NOT_FOUND: {
    code: 'REFERENTIEL_NOT_FOUND',
    message: 'Référentiel introuvable',
  },
};
export const PROMOTIONS_ERRORS = {
  NOT_FOUND: {
    code: 'PROMOTION_NOT_FOUND',
    message: 'Promotion introuvable',
  },
};
