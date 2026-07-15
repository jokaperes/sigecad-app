import type { Items, Labels } from "./types";

/**
 * Eventos legíveis comparando dois dicts de items. old={} => baseline
 * (faltas/resultado não viram evento no baseline). Espelha `diff` de sigecad.py.
 */
export function diff(old: Items, next: Items, labels: Labels): string[] {
  const events: string[] = [];
  for (const [key, cur] of Object.entries(next)) {
    const prev = old[key];
    if (prev === undefined) {
      if (key.endsWith("::resultado") || key.endsWith("::faltas")) continue;
      events.push(`Nova avaliação: ${labels[key]}`);
    } else if (prev.hash !== cur.hash) {
      if (key.endsWith("::faltas")) {
        events.push(`Faltas atualizadas: ${labels[key]}`);
      } else if (key.endsWith("::resultado")) {
        events.push(`Resultado alterado: ${labels[key]}`);
      } else if (!prev.publicar && cur.publicar) {
        events.push(`NOTA PUBLICADA: ${labels[key]} saiu!`);
      } else {
        events.push(`Nota alterada: ${labels[key]}`);
      }
    }
  }
  return events;
}
