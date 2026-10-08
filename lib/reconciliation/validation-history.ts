import { usesPersistentValidation } from './validation-provider';

export type ValidationAuditEvent = {
  action: string;
  previousStatus: string;
  newStatus: string;
  actor: string;
  actorRole: string;
  remarks: string;
  blockingExceptions: number;
  occurredAt: string;
};

export type ValidationHistoryResponse = {
  ok: boolean;
  source: 'preview' | 'facilityos';
  sessionName: string;
  events: ValidationAuditEvent[];
  error?: string;
};

const sampleEvents: ValidationAuditEvent[] = [
  {
    action: 'submit',
    previousStatus: 'DRAFT',
    newStatus: 'SUBMITTED',
    actor: 'preview@facilityos.local',
    actorRole: 'inventory',
    remarks: 'Synthetic preview event',
    blockingExceptions: 1,
    occurredAt: '2026-09-20T10:00:00Z',
  },
];

export async function getValidationHistory(sessionName: string, sid?: string): Promise<ValidationHistoryResponse> {
  if (!usesPersistentValidation()) {
    return {
      ok: true,
      source: 'preview',
      sessionName,
      events: sampleEvents,
    };
  }

  if (!sid) {
    return {
      ok: false,
      source: 'facilityos',
      sessionName,
      events: [],
      error: 'Authentication required.',
    };
  }

  const baseUrl = process.env.ERPNEXT_BASE_URL?.replace(/\/$/, '');
  if (!baseUrl) {
    return {
      ok: false,
      source: 'facilityos',
      sessionName,
      events: [],
      error: 'FacilityOS server is not configured.',
    };
  }

  try {
    const url = new URL(`${baseUrl}/api/method/facility_os.api.validation.history`);
    url.searchParams.set('session_name', sessionName);

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        Cookie: `sid=${sid}`,
      },
      cache: 'no-store',
    });

    if (!response.ok) throw new Error('History request failed.');

    const payload = await response.json() as {
      message?: {
        sessionName?: string;
        events?: Array<{
          action?: string;
          previous_status?: string;
          new_status?: string;
          actor?: string;
          actor_role?: string;
          remarks?: string;
          blocking_exceptions?: number;
          occurred_at?: string;
        }>;
      };
    };

    return {
      ok: true,
      source: 'facilityos',
      sessionName: payload.message?.sessionName ?? sessionName,
      events: (payload.message?.events ?? []).map((event) => ({
        action: event.action ?? '',
        previousStatus: event.previous_status ?? '',
        newStatus: event.new_status ?? '',
        actor: event.actor ?? '',
        actorRole: event.actor_role ?? '',
        remarks: event.remarks ?? '',
        blockingExceptions: Number(event.blocking_exceptions ?? 0),
        occurredAt: event.occurred_at ?? '',
      })),
    };
  } catch {
    return {
      ok: false,
      source: 'facilityos',
      sessionName,
      events: [],
      error: 'Validation history could not be loaded.',
    };
  }
}
