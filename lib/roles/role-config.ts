import type { FacilityRole } from '../auth/types';

export type RoleWorkspace = {
  role: Exclude<FacilityRole, 'unknown'>;
  title: string;
  subtitle: string;
  route: string;
  purpose: string;
  primaryActions: Array<{ label: string; href: string }>;
  permissions: string[];
};

export const roleWorkspaces: RoleWorkspace[] = [
  {
    role: 'inventory',
    title: 'Inventory Person',
    subtitle: 'Store operations & physical truth',
    route: '/inventory/dashboard',
    purpose: 'Receive, identify, locate, count and reconcile physical inventory before controlled ERP posting.',
    primaryActions: [
      { label: 'Scan QR', href: '/inventory/scan' },
      { label: 'Physical Count', href: '/inventory/count' },
      { label: 'Move Stock', href: '/inventory/move' },
      { label: 'Traceability', href: '/inventory/traceability' },
    ],
    permissions: [
      'Scan/search inventory',
      'Record physical counts',
      'Manage FacilityOS locations/containers',
      'Resolve traceability issues',
      'Submit and validate inventory',
      'Cannot Admin-approve own validation',
    ],
  },
  {
    role: 'shopfloor',
    title: 'Shopfloor',
    subtitle: 'Assembly, route cards & genealogy',
    route: '/shopfloor',
    purpose: 'Build and maintain traceable SFG/drone genealogy while keeping component identity and production history intact.',
    primaryActions: [
      { label: 'Build SFG', href: '/shopfloor#build' },
      { label: 'Scan Component', href: '/inventory/scan' },
      { label: 'Route Cards', href: '/shopfloor#route-cards' },
      { label: 'Genealogy', href: '/shopfloor#genealogy' },
    ],
    permissions: [
      'Scan components and SFGs',
      'Build SFG genealogy',
      'Install/remove/replace components',
      'Update route-card stages',
      'Flag damaged/quarantine components',
      'No Admin approval',
    ],
  },
  {
    role: 'mis',
    title: 'MIS',
    subtitle: 'Read-only operational analytics',
    route: '/mis',
    purpose: 'Monitor inventory, movement, exceptions, traceability and shopfloor performance without changing operational records.',
    primaryActions: [
      { label: 'Inventory MIS', href: '/mis?module=Inventory' },
      { label: 'Exceptions', href: '/mis?metric=Exceptions' },
      { label: 'Movement Report', href: '/mis?metric=Moves' },
      { label: 'Sync Status', href: '/admin/sync' },
    ],
    permissions: [
      'Read dashboards and reports',
      'Filter by company/warehouse/period',
      'View exception and movement trends',
      'Export/reporting workflow later',
      'Cannot modify stock or genealogy',
      'Cannot validate or approve',
    ],
  },
  {
    role: 'admin',
    title: 'Admin',
    subtitle: 'Controls, approvals & system health',
    route: '/admin',
    purpose: 'Govern roles, validation approvals, integrations, sync health, master-data gates and production safety controls.',
    primaryActions: [
      { label: 'Approval Queue', href: '/inventory/reconciliation/validation' },
      { label: 'Integration Health', href: '/admin/integrations' },
      { label: 'Sync Status', href: '/admin/sync' },
      { label: 'Audit & Controls', href: '/admin#audit' },
    ],
    permissions: [
      'Admin-approve validated inventory',
      'Manage FacilityOS users/roles',
      'Review audit trail',
      'Run controlled read-model sync',
      'Review master-data/release gates',
      'ERP stock posting remains separately gated',
    ],
  },
];

export function workspaceForRole(role: FacilityRole) {
  return roleWorkspaces.find((workspace) => workspace.role === role);
}
