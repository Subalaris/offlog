import { z } from "zod";

export const currencies = Intl.supportedValuesOf("currency");
export const profileSchema = z.object({
  display_name: z.string().trim().max(80, "Name must be 80 characters or fewer."),
  home_city: z.string().trim().max(100, "City must be 100 characters or fewer."),
  home_country: z.string().trim().max(100, "Country must be 100 characters or fewer."),
  preferred_currency: z.string().refine(value => currencies.includes(value), "Choose a supported currency."),
});
export type Profile = z.infer<typeof profileSchema>;

export function readProfile(metadata: Record<string, unknown> = {}): Profile {
  const text = (key: string, max: number) => typeof metadata[key] === "string" ? metadata[key].slice(0, max) : "";
  const currency = metadata.preferred_currency;
  return {
    display_name: text("display_name", 80),
    home_city: text("home_city", 100),
    home_country: text("home_country", 100),
    preferred_currency: typeof currency === "string" && currencies.includes(currency) ? currency : "USD",
  };
}
