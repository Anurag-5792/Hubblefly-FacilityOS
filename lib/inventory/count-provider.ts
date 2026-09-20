export type SaveCountInput = {
  target: string;
  quantity: number;
  condition?: string;
  container?: string;
};

export type SaveCountResult = {
  ok: boolean;
  persisted: boolean;
  sessionName?: string;
  target?: string;
  targetType?: string;
  itemCode?: string | null;
  physicalQty?: number;
  condition?: string;
  container?: string | null;
  location?: string | null;
  lineStatus?: string;
  blockingExceptions?: number;
  validationStatus?: string;
  note?: string;
  error?: string;
};

function useFrappeOperations() {
  return process.env.FACILITYOS_OPERATIONS_SOURCE === 'frappe'
    || (!process.env.FACILITYOS_OPERATIONS_SOURCE && process.env.FACILITYOS_MIS_SOURCE === 'frappe');
}

async function method<T>(
  baseUrl: string,
  sid: string,
  methodName: string,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`${baseUrl}/api/method/${methodName}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Cookie: `sid=${sid}`,
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });

  if (!response.ok) throw new Error(`FacilityOS method failed with HTTP ${response.status}.`);
  return response.json() as Promise<T>;
}

export async function savePhysicalCount(input: SaveCountInput, sid?: string): Promise<SaveCountResult> {
  if (!useFrappeOperations()) {
    return {
      ok: true,
      persisted: false,
      target: input.target.trim().toUpperCase(),
      physicalQty: input.quantity,
      condition: input.condition ?? 'Good',
      container: input.container?.trim().toUpperCase() || null,
      note: 'Preview mode: count was validated but not persisted.',
    };
  }

  if (!sid) {
    return { ok: false, persisted: false, error: 'Sign in before saving a physical count.' };
  }

  const baseUrl = process.env.ERPNEXT_BASE_URL?.replace(/\/$/, '');
  if (!baseUrl) {
    return { ok: false, persisted: false, error: 'FacilityOS server URL is not configured.' };
  }

  const company = process.env.FACILITYOS_DEFAULT_COMPANY ?? 'Hubblefly Technologies Limited';
  const warehouse = process.env.FACILITYOS_DEFAULT_WAREHOUSE ?? 'HFT Store';

  try {
    const sessionPayload = await method<{ message?: { sessionName?: string } }>(
      baseUrl,
      sid,
      'facility_os.api.count.ensure_session',
      { company, warehouse },
    );
    const sessionName = sessionPayload.message?.sessionName;
    if (!sessionName) throw new Error('FacilityOS did not return a physical-count session.');

    const countPayload = await method<{ message?: SaveCountResult }>(
      baseUrl,
      sid,
      'facility_os.api.count.record_count',
      {
        session_name: sessionName,
        target: input.target,
        quantity: input.quantity,
        condition: input.condition ?? 'Good',
        container: input.container ?? '',
      },
    );

    if (!countPayload.message?.ok) throw new Error('FacilityOS did not persist the count.');
    return countPayload.message;
  } catch {
    return {
      ok: false,
      persisted: false,
      error: 'Physical count could not be saved to FacilityOS. Check the signed-in role and server connection.',
    };
  }
}
