export interface CityRecord {
  cityId: number;
  name: string;
  altName: string;
  country: string;
  adminCode: string;
  population: number;
  loc: { coordinates: [number, number] };
}

export interface CityCandidate {
  id: number;
  name: string;
  country: string;
  region: string;
  latitude: number;
  longitude: number;
}

function normalized(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

const countryNames = new Intl.DisplayNames(["en"], { type: "region" });
const aliases: Record<string, string> = {
  usa: "US", us: "US", unitedstatesofamerica: "US", uk: "GB", greatbritain: "GB", england: "GB",
  scotland: "GB", wales: "GB", southkorea: "KR", northkorea: "KP", russia: "RU", vietnam: "VN",
  czechrepublic: "CZ", turkey: "TR", uae: "AE",
};

export function findCityCandidates(cities: CityRecord[], city: string, country: string, countryCode?: string | null): CityCandidate[] {
  const name = normalized(city);
  const nation = normalized(country);
  if (!name || !nation) return [];
  const code = countryCode?.toUpperCase() || aliases[nation] || (country.length === 2 ? country.toUpperCase() : null);
  return cities.filter((entry) => {
    if (code ? entry.country !== code : normalized(countryNames.of(entry.country) || "") !== nation) return false;
    return [entry.name, ...(entry.altName || "").split(",")].some((candidate) => normalized(candidate) === name);
  }).sort((a, b) => b.population - a.population).slice(0, 8).map((entry) => ({
    id: entry.cityId,
    name: entry.name,
    country: countryNames.of(entry.country) || entry.country,
    region: entry.adminCode,
    longitude: entry.loc.coordinates[0],
    latitude: entry.loc.coordinates[1],
  }));
}
