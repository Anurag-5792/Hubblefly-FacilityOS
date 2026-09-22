export type MoveContainerResult = {
  ok: boolean;
  persisted: boolean;
  containerId?: string;
  fromPosition?: string | null;
  toPosition?: string;
  actor?: string;
  auditId?: string;
  erpNextPosted: boolean;
  note?: string;
  error?: string;
};

function useFrappeOperations() {
  return process.env.FACILITYOS_OPERATIONS_SOURCE === 'frappe'
    || (!process.env.FACILITYOS_OPERATIONS_SOURCE && process.env.FACILITYOS_MIS_SOURCE === 'frappe');
}

export async function saveContainerMove(
  containerId: string,
  destinationPosition: string,
  remarks: string | undefined,
  sid?: string,
): Promise<MoveContainerResult> {
  const container = containerId.trim().toUpperCase();
  const destination = destinationPosition.trim().toUpperCase();

  if (!useFrappeOperations()) {
    return {
      ok: true,
      persisted: false,
      containerId: container,
      toPosition: destination,
      erpNextPosted: false,
      note: 'Preview mode: container location move was not persisted.',
    };
  }

  if (!sid) {
    return {
      ok: false,
      persisted: false,
      erpNextPosted: false,
      error: 'Sign in before saving a container move.',
    };
  }

  const baseUrl = process.env.ERPNEXT_BASE_URL?.replace(/\/$/, '');
  if (!baseUrl) {
    return {
      ok: false,
      persisted: false,
      erpNextPosted: false,
      error: 'FacilityOS server URL is not configured.',
    };
  }

  try {
    const response = await fetch(`${baseUrl}/api/method/facility_os.api.move.move_container`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Cookie: `sid=${sid}`,
      },
      body: JSON.stringify({
        container_id: container,
        destination_position: destination,
        remarks: remarks ?? '',
      }),
      cache: 'no-store',
    });

    if (!response.ok) throw new Error('FacilityOS move was rejected.');
    const payload = await response.json() as { message?: MoveContainerResult };
    if (!payload.message?.ok) throw new Error('FacilityOS move did not persist.');
    return payload.message;
  } catch {
    return {
      ok: false,
      persisted: false,
      erpNextPosted: false,
      error: 'Container move could not be saved. Check the signed-in role, IDs and FacilityOS connection.',
    };
  }
}
