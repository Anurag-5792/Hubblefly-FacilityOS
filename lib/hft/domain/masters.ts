import { parseQuantity } from './quantity.ts';

export type Employee = Readonly<{
  legalEntityId: string; employeeId: string; fullName: string; department: string;
  designation: string; siteId: string; active: boolean; version: number;
}>;
export type Item = Readonly<{
  legalEntityId: string; itemCode: string; uom: string; control: 'NONE' | 'SERIAL' | 'BATCH'; active: boolean; version: number;
}>;
export type Supplier = Readonly<{ legalEntityId: string; supplierId: string; legalName: string; active: boolean; version: number }>;
export type Warehouse = Readonly<{ legalEntityId: string; warehouseId: string; siteId: string; active: boolean; version: number }>;
export type EmployeeImportResult = Readonly<{ valid: readonly Employee[]; errors: readonly { row: number; code: string }[] }>;

const id = /^[A-Z0-9][A-Z0-9._-]{1,63}$/;
function required(value: string, code: string): void {
  if (typeof value !== 'string' || !value.trim() || value.length > 160) throw new Error(code);
}
export function validateEmployee(employee: Employee): Employee {
  for (const [value, code] of [[employee.legalEntityId, 'COMPANY_REQUIRED'], [employee.employeeId, 'EMPLOYEE_ID_INVALID'], [employee.siteId, 'SITE_REQUIRED']] as const) {
    if (!id.test(value)) throw new Error(code);
  }
  required(employee.fullName, 'EMPLOYEE_NAME_REQUIRED');
  required(employee.department, 'DEPARTMENT_REQUIRED');
  required(employee.designation, 'DESIGNATION_REQUIRED');
  if (typeof employee.active !== 'boolean' || !Number.isSafeInteger(employee.version) || employee.version < 1) throw new Error('EMPLOYEE_METADATA_INVALID');
  return employee;
}
export function validateItem(item: Item): Item {
  if (!id.test(item.legalEntityId) || !id.test(item.itemCode) || !id.test(item.uom)) throw new Error('ITEM_IDENTIFIERS_INVALID');
  if (!['NONE', 'SERIAL', 'BATCH'].includes(item.control)) throw new Error('ITEM_CONTROL_INVALID');
  if (!item.active || !Number.isSafeInteger(item.version) || item.version < 1) throw new Error('ITEM_INACTIVE_OR_VERSION_INVALID');
  return item;
}
export function validateSupplier(supplier: Supplier): Supplier {
  if (!id.test(supplier.legalEntityId) || !id.test(supplier.supplierId)) throw new Error('SUPPLIER_ID_INVALID');
  required(supplier.legalName, 'SUPPLIER_NAME_REQUIRED');
  if (!supplier.active || !Number.isSafeInteger(supplier.version) || supplier.version < 1) throw new Error('SUPPLIER_INACTIVE_OR_VERSION_INVALID');
  return supplier;
}
export function validateWarehouse(warehouse: Warehouse): Warehouse {
  if (!id.test(warehouse.legalEntityId) || !id.test(warehouse.warehouseId) || !id.test(warehouse.siteId)) throw new Error('WAREHOUSE_IDENTIFIERS_INVALID');
  if (!warehouse.active || !Number.isSafeInteger(warehouse.version) || warehouse.version < 1) throw new Error('WAREHOUSE_INACTIVE_OR_VERSION_INVALID');
  return warehouse;
}

/** Strict RFC-4180-style parser: multiline quoted cells, escaped quotes, no silent row drops. */
export function parseCsv(input: string): string[][] {
  if (typeof input !== 'string' || input.length > 2_000_000) throw new Error('CSV_SIZE_INVALID');
  const rows: string[][] = [];
  let row: string[] = []; let cell = ''; let quoted = false; let afterQuote = false;
  const finishCell = () => { row.push(cell); cell = ''; afterQuote = false; };
  const finishRow = () => { finishCell(); rows.push(row); row = []; };
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === '"' && input[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') { quoted = false; afterQuote = true; }
      else cell += c;
    } else if (c === ',' || c === '\n' || c === '\r') {
      if (c === ',') finishCell();
      else { if (c === '\r' && input[i + 1] === '\n') i++; finishRow(); }
    } else if (c === '"' && cell === '' && !afterQuote) quoted = true;
    else if (afterQuote || c === '"') throw new Error('CSV_MALFORMED_QUOTES');
    else cell += c;
  }
  if (quoted) throw new Error('CSV_UNTERMINATED_QUOTE');
  if (row.length > 0 || cell.length > 0 || afterQuote) finishRow();
  return rows;
}

export function validateEmployeeCsv(csv: string, legalEntityId: string, existingIds: ReadonlySet<string> = new Set()): EmployeeImportResult {
  const rows = parseCsv(csv.replace(/^\uFEFF/, ''));
  const header = ['employee_id', 'full_name', 'department', 'designation', 'site_id', 'active'];
  if (rows.length === 0 || rows[0].length !== header.length || rows[0].some((c, i) => c.trim().toLowerCase() !== header[i])) {
    throw new Error('EMPLOYEE_CSV_HEADER_INVALID');
  }
  const valid: Employee[] = []; const errors: { row: number; code: string }[] = []; const seen = new Set(existingIds);
  for (let i = 1; i < rows.length; i++) {
    const values = rows[i];
    if (values.length === 1 && !values[0].trim()) continue;
    try {
      if (values.length !== header.length) throw new Error('EMPLOYEE_CSV_COLUMNS_INVALID');
      const flag = values[5].trim().toLowerCase();
      if (!['true', 'false', '1', '0'].includes(flag)) throw new Error('EMPLOYEE_ACTIVE_INVALID');
      const employee = validateEmployee({ legalEntityId, employeeId: values[0].trim(), fullName: values[1].trim(), department: values[2].trim(), designation: values[3].trim(), siteId: values[4].trim(), active: flag === 'true' || flag === '1', version: 1 });
      const key = `${employee.legalEntityId}:${employee.employeeId}`;
      if (seen.has(key)) throw new Error('EMPLOYEE_ID_DUPLICATE');
      seen.add(key); valid.push(employee);
    } catch (error) { errors.push({ row: i + 1, code: error instanceof Error ? error.message : 'EMPLOYEE_ROW_INVALID' }); }
  }
  return { valid, errors };
}

/** Future Excel adapter must convert a vetted workbook to this same validated row contract. */
export function requireAvailableQuantityString(qty: string): void { if (parseQuantity(qty) <= 0n) throw new Error('QUANTITY_MUST_BE_POSITIVE'); }
