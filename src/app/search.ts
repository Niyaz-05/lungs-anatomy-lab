import type { AnatomicalStructure } from '../contract/schema';

export interface SearchHit {
  structure: AnatomicalStructure;
  /** The name or synonym that matched, for display ("matched: LAD"). */
  matched: string;
  score: number;
}

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Ranks structures by how well their label or a synonym matches the query: exact > prefix >
 * word prefix > substring. Every query word must match somewhere in the same name. Empty query
 * returns nothing, so the caller shows the full list instead.
 */
export function searchStructures(structures: readonly AnatomicalStructure[], query: string, limit = 12): SearchHit[] {
  const q = norm(query);
  if (!q) return [];
  const words = q.split(' ');
  const hits: SearchHit[] = [];
  for (const s of structures) {
    let best: SearchHit | null = null;
    for (const [i, name] of [s.label, ...s.synonyms].entries()) {
      const n = norm(name);
      if (!words.every((w) => n.includes(w))) continue;
      let score = 1;
      if (n === q) score = 100;
      else if (n.startsWith(q)) score = 60;
      else if (n.split(' ').some((part) => part.startsWith(words[0] ?? ''))) score = 30;
      if (i === 0) score += 5; // prefer the label over a synonym at equal quality
      if (!best || score > best.score) best = { structure: s, matched: name, score };
    }
    if (best) hits.push(best);
  }
  return hits.sort((a, b) => b.score - a.score || a.structure.label.localeCompare(b.structure.label)).slice(0, limit);
}
