/** Exact micro-unit quantity representation; 6 decimal places. */
export function parseQuantity(s: string): bigint {
  if (typeof s !== 'string' || !/^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/.test(s)) throw new Error('QUANTITY_INVALID');
  const [whole, fraction = ''] = s.split('.');
  const micro = BigInt(whole) * 1_000_000n + BigInt((fraction + '000000').slice(0,6));
  if (micro < 0n || micro > 9_223_372_036_854_775_807n) throw new Error('QUANTITY_OVERFLOW');
  return micro;
}
export function formatQuantity(micro: bigint): string {
  if (micro < 0n) throw new Error('QUANTITY_INVALID');
  const whole = micro / 1_000_000n;
  const decimal = (micro % 1_000_000n).toString().padStart(6,'0').replace(/0+$/,'');
  return decimal ? `${whole}.${decimal}` : String(whole);
}
export function requireSerializedUnit(quantity: bigint): void {
  if (quantity !== 1_000_000n) throw new Error('SERIAL_QUANTITY_MUST_EQUAL_ONE');
}

/** Only journal deltas and reconciliation variances may be signed. */
export function formatSignedQuantity(deltaMicro: bigint): string {
  if (deltaMicro < 0n) return '-' + formatQuantity(-deltaMicro);
  return formatQuantity(deltaMicro);
}

/** Zero/negative operations must never be accepted as posted stock quantities. */
export function requirePositive(quantityMicro: bigint): void {
  if (quantityMicro <= 0n) throw new Error('QUANTITY_MUST_BE_POSITIVE');
}
