export const sortDirections = ["asc", "desc"] as const;
export type SortDirection = (typeof sortDirections)[number];

export interface SortRequest<Field extends string> {
  readonly field: Field;
  readonly direction: SortDirection;
}

export function parseSortRequest<const Field extends string>(
  input: { field: string; direction?: string },
  allowedFields: readonly Field[],
): Readonly<SortRequest<Field>> {
  if (!allowedFields.includes(input.field as Field)) throw new TypeError("Sort field is not allowlisted.");
  const direction = input.direction ?? "asc";
  if (direction !== "asc" && direction !== "desc") {
    throw new TypeError("Sort direction must be asc or desc.");
  }
  return Object.freeze({ field: input.field as Field, direction });
}

export function withDeterministicTieBreaker<Field extends string>(
  requested: SortRequest<Field>,
  tieBreakerField: Field,
  tieBreakerDirection: SortDirection = "asc",
): readonly Readonly<SortRequest<Field>>[] {
  if (requested.field === tieBreakerField) return Object.freeze([requested]);
  return Object.freeze([
    requested,
    Object.freeze({ field: tieBreakerField, direction: tieBreakerDirection }),
  ]);
}
