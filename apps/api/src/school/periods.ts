/** Fonctions de dates pures (testées sans base de données). */

/** Date du jour au format AAAA-MM-JJ (heure de Conakry = UTC). */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Période (trimestre/semestre) qui contient une date ; à défaut la dernière commencée, sinon la première. */
export function termFor<T extends { startsOn: Date; endsOn: Date }>(terms: readonly T[], date: string): T | undefined {
  const inside = terms.find((t) => isoDate(t.startsOn) <= date && date <= isoDate(t.endsOn));
  if (inside) return inside;
  const started = terms.filter((t) => isoDate(t.startsOn) <= date);
  return started[started.length - 1] ?? terms[0];
}

/** Découpe une année en périodes de durées égales. */
export function splitPeriods(startsOn: string, endsOn: string, count: number): { startsOn: string; endsOn: string }[] {
  const start = Date.parse(`${startsOn}T00:00:00Z`);
  const end = Date.parse(`${endsOn}T00:00:00Z`);
  const day = 86_400_000;
  const totalDays = Math.round((end - start) / day) + 1;
  const out: { startsOn: string; endsOn: string }[] = [];
  for (let i = 0; i < count; i++) {
    const from = start + Math.floor((totalDays * i) / count) * day;
    const to = i === count - 1 ? end : start + (Math.floor((totalDays * (i + 1)) / count) - 1) * day;
    out.push({ startsOn: new Date(from).toISOString().slice(0, 10), endsOn: new Date(to).toISOString().slice(0, 10) });
  }
  return out;
}
