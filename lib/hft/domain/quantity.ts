/** Inventory base-unit quantities use exact millionths, never IEEE-754 floats. */
export const SCALE = 1_000_000n;
export type MicroQty = bigint & { readonly __microQty: unique symbol };

export function parseQuantity(value: string): MicroQty {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,14})(?:\.\d{1,6})?$/.test(value)) {
    throw new Error('QUANTITY_INVALID');
  }
  const [whole, decimal = ''] = value.split('.');
  const result = BigInt(whole) * SCALE + BigInt(decimal.padEnd(6, '0') || '0');
  return result as MicroQty;
}

export function formatQuantity(value: bigint): string {
  const negative = value < 0n;
  const v = negative ? -value : value;
  const suffix = (v % SCALE).toString().padStart(6, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${v / SCALE}${suffix ? '.' + suffix : ''}`;
}

export function requirePositive(value: MicroQty): void {
  if (value <= 0n) throw new Error('QUANTITY_MUST_BE_POSITIVE');
}

export function requireSerializedUnit(value: MicroQty): void {
  if (value !== SCALE) throw new Error('SERIAL_QUANTITY_MUST_EQUAL_ONE');
}
