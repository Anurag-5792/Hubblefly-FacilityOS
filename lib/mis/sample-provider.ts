import type { MisFilters, MisQueryResponse, MisRow } from './types';

const sampleRows = [
  { label: 'Power Systems', stock: 120, moves: 8, exceptions: 1 },
  { label: 'Propulsion', stock: 84, moves: 6, exceptions: 2 },
  { label: 'Structures', stock: 156, moves: 5, exceptions: 1 },
  { label: 'Avionics', stock: 62, moves: 4, exceptions: 0 },
  { label: 'Spray System', stock: 97, moves: 3, exceptions: 1 },
];

function metricValue(row: Omit<MisRow, 'displayed'>, metric: string) {
  if (metric === 'Moves') return row.moves;
  if (metric === 'Exceptions') return row.exceptions;
  return row.stock;
}

export function querySampleMis(filters: MisFilters): MisQueryResponse {
  const rows: MisRow[] = sampleRows.map((row) => ({
    ...row,
    displayed: metricValue(row, filters.metric),
  }));

  return {
    ok: true,
    source: 'sample',
    lastSyncedAt: null,
    rows,
    total: rows.reduce((sum, row) => sum + row.displayed, 0),
    note: 'Synthetic preview data. The approved physical-count workbook remains outside the public repository.',
  };
}
