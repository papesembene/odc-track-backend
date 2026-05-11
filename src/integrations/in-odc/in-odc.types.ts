export type InOdcPromotion = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: string;
  photoUrl?: string | null;
  referentials?: Array<{
    id: string;
    name: string;
    description?: string | null;
  }>;
};

export type InOdcReferential = {
  id: string;
  name: string;
  description?: string | null;
  capacity: number;
  numberOfSessions: number;
  sessionLength?: number | null;
  photoUrl?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type InOdcReferenceLearner = {
  id: string;
  firstName: string;
  lastName: string;
  matricule: string;
  phone: string;
  status: string;
  user: {
    email: string;
  };
  promotion: {
    id: string;
    name: string;
    status: string;
  };
  referential: {
    id: string;
    name: string;
  } | null;
  session: {
    id: string;
    name: string;
  } | null;
};

export type InOdcReferenceCoach = {
  id: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  matricule?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  user?: {
    id: string;
    email: string;
    role: string;
  } | null;
  referentials: Array<{
    id: string;
    name: string;
  }>;
};

export type InOdcReferenceLearnersQuery = {
  search?: string;
  promotionId?: string;
  refId?: string;
  status?: string;
  page?: number;
  limit?: number;
};

export type InOdcReferenceLearnersResponse = {
  items: InOdcReferenceLearner[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
};

export type InOdcLearnerDetail = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  address?: string | null;
  gender?: string | null;
  birthDate?: string | null;
  status: string;
  refId?: string | null;
  user: {
    id: string;
    email: string;
  };
  promotion: {
    id: string;
    name: string;
    status: string;
    startDate?: string;
    endDate?: string;
  };
  referential: {
    id: string;
    name: string;
    description?: string | null;
  } | null;
};

export type InOdcLoginResponse = {
  access_token: string;
  user: {
    id: string;
    email: string;
    role: string;
  };
};
