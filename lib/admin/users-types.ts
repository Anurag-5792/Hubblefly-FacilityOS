export type FacilityUser = {
  user: string;
  fullName: string;
  email: string;
  roles: string[];
  lastLogin?: string | null;
};

export type FacilityUsersResponse = {
  ok: boolean;
  source: 'preview' | 'facilityos';
  users: FacilityUser[];
  availableRoles: string[];
  error?: string;
};

export type FacilityRoleUpdateResponse = {
  ok: boolean;
  persisted: boolean;
  user?: string;
  roles?: string[];
  note?: string;
  error?: string;
};
