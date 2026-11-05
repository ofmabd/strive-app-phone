import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Compile only the pure storage module in memory; no React Native mocks or output files.
const compiled = ts.transpileModule(readFileSync(new URL("../scoreStorage.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleExports = {};
new Function("exports", compiled)(moduleExports);
const { createScoreStore, diagnoseScores, SCORE_BACKUP_KEY } = moduleExports;
const first = { date: "Thu Nov 05 2026", score: 80 };
const second = { date: "Fri Nov 06 2026", score: 65 };
const mixed = JSON.stringify([first, { date: "11/05/26", score: 45 }, 72]);
function memory(raw) {
    const data = new Map(raw === null ? [] : [["scores", raw]]);
    const writes = [];
    const storage = {
        getItem: async (key) => data.get(key) ?? null,
        setItem: async (key, value) => { writes.push(key); data.set(key, value); },
    };
    return { data, writes, storage };
}
test("valid original entries and missing data need no migration", async () => {
    for (const raw of [null, JSON.stringify([first])]) {
        const m = memory(raw);
        assert.deepEqual(await createScoreStore(m.storage).load(), raw === null ? [] : [first]);
        assert.deepEqual(m.writes, []);
    }
});
test("mixed entries recover only valid scores after an exact verified backup", async () => {
    const m = memory(mixed);
    assert.deepEqual(await createScoreStore(m.storage).load(), [first]);
    assert.equal(m.data.get(SCORE_BACKUP_KEY), mixed);
    assert.deepEqual(m.writes, [SCORE_BACKUP_KEY, "scores"]);
});
test("calendar dates normalize without generic date parsing or numeric coercion", () => {
    const raw = JSON.stringify([{ date: "2026-11-05", score: 80 }, { date: "2026-02-30", score: 60 },
        { date: "Wed Nov 05 2026", score: 50 }, { date: "2026-11-06T00:00:00Z", score: 60 },
        { date: first.date, score: "80" }, { date: second.date, score: 101 }]);
    const result = diagnoseScores(raw);
    assert.deepEqual(result.entries, [first]);
    assert.equal(result.issues.length, 5);
});
test("conflicting same-day values are quarantined; identical duplicates are safe", () => {
    assert.deepEqual(diagnoseScores(JSON.stringify([first, first])).entries, [first]);
    assert.deepEqual(diagnoseScores(JSON.stringify([first, { ...first, score: 50 }, second])).entries, [second]);
});
test("backup creation failure aborts before touching scores", async () => {
    const m = memory(mixed);
    m.storage.setItem = async () => { throw new Error("disk full"); };
    await assert.rejects(createScoreStore(m.storage).load(), /disk full/);
    assert.equal(m.data.get("scores"), mixed);
});
test("backup verification failure aborts before touching scores", async () => {
    const m = memory(mixed);
    m.storage.getItem = async (key) => key === SCORE_BACKUP_KEY ? null : m.data.get(key) ?? null;
    await assert.rejects(createScoreStore(m.storage).load(), /backup verification/);
    assert.equal(m.data.get("scores"), mixed);
    assert.deepEqual(m.writes, [SCORE_BACKUP_KEY]);
});
test("existing backups are never overwritten, including a later distinct payload", async () => {
    const m = memory(mixed);
    m.data.set(SCORE_BACKUP_KEY, "older raw data");
    await createScoreStore(m.storage).load();
    assert.equal(m.data.get(SCORE_BACKUP_KEY), "older raw data");
    assert.equal(m.data.get(`${SCORE_BACKUP_KEY}:1`), mixed);
    assert.ok(!m.writes.includes(SCORE_BACKUP_KEY));
});
test("repeated migration and retry after interruption reuse backup safely", async () => {
    const m = memory(mixed);
    const set = m.storage.setItem;
    m.storage.setItem = async (key, value) => {
        if (key === "scores")
            throw new Error("interrupted");
        await set(key, value);
    };
    await assert.rejects(createScoreStore(m.storage).load(), /interrupted/);
    assert.equal(m.data.get("scores"), mixed);
    assert.equal(m.data.get(SCORE_BACKUP_KEY), mixed);
    m.storage.setItem = set;
    await createScoreStore(m.storage).load();
    const writes = m.writes.length;
    await createScoreStore(m.storage).load();
    assert.equal(m.writes.length, writes);
    assert.equal(m.writes.filter((key) => key === SCORE_BACKUP_KEY).length, 1);
});
test("malformed JSON and unknown root shapes are backed up exactly before recovery", async () => {
    for (const raw of ["{broken", "null", "{}", '[80,null]']) {
        const m = memory(raw);
        assert.deepEqual(await createScoreStore(m.storage).load(), []);
        assert.equal(m.data.get(SCORE_BACKUP_KEY), raw);
        assert.equal(m.data.get("scores"), "[]");
    }
});
test("new check-in persists after recovery; updates preserve other days", async () => {
    const m = memory(mixed);
    const store = createScoreStore(m.storage);
    await store.save(second);
    await store.save({ ...first, score: 85 });
    assert.deepEqual(JSON.parse(m.data.get("scores")), [{ ...first, score: 85 }, second]);
    assert.equal(m.data.get(SCORE_BACKUP_KEY), mixed);
});
test("failed writes and failed read-back verification reject save", async () => {
    const m = memory(JSON.stringify([first]));
    m.storage.setItem = async () => { throw new Error("write failed"); };
    await assert.rejects(createScoreStore(m.storage).save(second), /write failed/);
    m.storage.setItem = async () => { };
    await assert.rejects(createScoreStore(m.storage).save(second), /persistence/);
    assert.equal(m.data.get("scores"), JSON.stringify([first]));
});
test("concurrent loads and saves are serialized", async () => {
    const m = memory(mixed);
    const store = createScoreStore(m.storage);
    await Promise.all([store.load(), store.save(second), store.save({ ...first, score: 70 })]);
    assert.deepEqual(await store.load(), [{ ...first, score: 70 }, second]);
});

test("backup read failure aborts; migration write verification failure is recoverable", async () => {
    const m = memory(mixed);
    const get = m.storage.getItem;
    m.storage.getItem = async (key) => {
        if (key === SCORE_BACKUP_KEY) throw new Error("read failed");
        return get(key);
    };
    await assert.rejects(createScoreStore(m.storage).load(), /read failed/);
    assert.equal(m.data.get("scores"), mixed);
    assert.deepEqual(m.writes, []);
    m.storage.getItem = get;
    const set = m.storage.setItem;
    m.storage.setItem = async (key, value) => {
        if (key !== "scores") await set(key, value);
    };
    await assert.rejects(createScoreStore(m.storage).load(), /persistence/);
    assert.equal(m.data.get("scores"), mixed);
    assert.equal(m.data.get(SCORE_BACKUP_KEY), mixed);
    m.storage.setItem = set;
    assert.deepEqual(await createScoreStore(m.storage).load(), [first]);
});

test("an external change detected before migration is never overwritten", async () => {
    const m = memory(mixed);
    const set = m.storage.setItem;
    m.storage.setItem = async (key, value) => {
        await set(key, value);
        if (key === SCORE_BACKUP_KEY) m.data.set("scores", JSON.stringify([second]));
    };
    await assert.rejects(createScoreStore(m.storage).load(), /changed/);
    assert.equal(m.data.get("scores"), JSON.stringify([second]));
    assert.equal(m.data.get(SCORE_BACKUP_KEY), mixed);
});
