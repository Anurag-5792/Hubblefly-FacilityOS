export type FacilityRole = 'inventory' | 'shopfloor' | 'mis' | 'admin' | 'unknown';

export type FacilitySession = {
  ok: boolean;
  source: 'preview' | 'frappe';
  authenticated: boolean;
  user: string | null;
  fullName: string | null;
  role: FacilityRole;
  roles: string[];
  error?: string;
};
