export type FacilityAuthSource = "preview" | "frappe" | "supabase";

export function facilityAuthSource(): FacilityAuthSource {
  const value = process.env.FACILITYOS_AUTH_SOURCE;
  if (value === "frappe" || value === "supabase") return value;
  return "preview";
}

export function usesSupabaseAuth(): boolean {
  return facilityAuthSource() === "supabase";
}
