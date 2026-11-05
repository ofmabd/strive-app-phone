import type { ScoreEntry } from "./storage";

type Storage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

export const SCORE_BACKUP_KEY = "scores:backup:recovery:v1";
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Parse calendar dates explicitly: Date.parse of toDateString is engine-dependent.
// Timestamps and locale-specific dates do not establish an unambiguous local day.
function normalizeDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const legacy = /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{2}) (\d{4})$/.exec(value);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!legacy && !iso) return null;
  const year = Number(legacy ? legacy[4] : iso![1]);
  const month = legacy ? months.indexOf(legacy[2]) : Number(iso![2]) - 1;
  const day = Number(legacy ? legacy[3] : iso![3]);
  const date = new Date(0);
  date.setFullYear(year, month, day);
  date.setHours(12, 0, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day ||
      (legacy && weekdays[date.getDay()] !== legacy[1])) return null;
  return date.toDateString();
}

export function diagnoseScores(raw: string | null): { entries: ScoreEntry[]; issues: string[] } {
  if (raw === null) return { entries: [], issues: [] };
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch {
    return { entries: [], issues: ["Malformed JSON; no entries can be safely extracted."] };
  }
  if (!Array.isArray(parsed)) return { entries: [], issues: ["Expected an array of dated scores."] };
  const entries: ScoreEntry[] = [];
  const issues: string[] = [];
  const conflicts = new Set<string>();
  parsed.forEach((value: unknown, index) => {
    if (typeof value !== "object" || value === null || !("date" in value) || !("score" in value)) {
      issues.push(`Entry ${index}: missing date or score.`);
      return;
    }
    const date = normalizeDate(value.date);
    if (date === null || typeof value.score !== "number" || !Number.isFinite(value.score) || value.score < 0 || value.score > 100) {
      issues.push(`Entry ${index}: ambiguous/invalid date or score outside 0–100.`);
      return;
    }
    const previous = entries.find((entry) => entry.date === date);
    if (previous && previous.score !== value.score) {
      conflicts.add(date);
      issues.push(`Entry ${index}: conflicting scores for the same day.`);
    } else if (!previous) entries.push({ date, score: value.score });
  });
  return { entries: entries.filter((entry) => !conflicts.has(entry.date)), issues };
}

export function createScoreStore(storage: Storage) {
  // Serialize Home reads/recovery and check-in writes within this app instance.
  let pending: Promise<unknown> = Promise.resolve();
  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = pending.then(operation);
    pending = result.catch(() => undefined);
    return result;
  }

  async function backup(raw: string) {
    // Reuse an exact backup after interruption; preserve all other backups forever.
    for (let index = 0; ; index++) {
      const key = index === 0 ? SCORE_BACKUP_KEY : `${SCORE_BACKUP_KEY}:${index}`;
      const existing = await storage.getItem(key);
      if (existing !== null && existing !== raw) continue;
      if (existing === null) await storage.setItem(key, raw);
      if (await storage.getItem(key) !== raw) throw new Error("Score backup verification failed. Scores were not changed.");
      return;
    }
  }

  async function writeVerified(raw: string | null, next: string) {
    if (await storage.getItem("scores") !== raw) throw new Error("Scores changed during recovery/save. Please retry.");
    await storage.setItem("scores", next);
    if (await storage.getItem("scores") !== next) throw new Error("Score persistence could not be verified. Please retry.");
  }

  async function load() {
    const raw = await storage.getItem("scores");
    const { entries, issues } = diagnoseScores(raw);
    const normalized = JSON.stringify(entries);
    if (raw !== null && raw !== normalized) {
      await backup(raw);
      await writeVerified(raw, normalized);
      if (issues.length) console.warn("Score recovery: unrecognized data preserved in backup.", issues);
    }
    return entries;
  }

  return {
    load: () => serialize(load),
    save: (entry: ScoreEntry) => serialize(async () => {
      const validated = diagnoseScores(JSON.stringify([entry]));
      if (validated.issues.length || validated.entries.length !== 1) throw new Error("Invalid new readiness score.");
      const scores = await load();
      const raw = await storage.getItem("scores");
      // Do not overwrite data changed by another writer after load.
      if (raw !== null && raw !== JSON.stringify(scores)) throw new Error("Scores changed before saving. Please retry.");
      const next = validated.entries[0];
      const index = scores.findIndex((item) => item.date === next.date);
      if (index === -1) scores.push(next);
      else scores[index] = next;
      await writeVerified(raw, JSON.stringify(scores));
    }),
  };
}
