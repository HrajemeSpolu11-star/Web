// JEN PRO ZÁTĚŽOVÝ TEST (není v repozitáři): obalí D1 a do hlaviček odpovědi přidá přečtené/zapsané řádky a počet dotazů.
import worker from "./index.js";
function obal(db, st) {
  const pocitej = (r, sql) => { const m = r?.meta || {}; if ((m.rows_read || 0) > 5000) console.log(`TEZKY ${m.rows_read} | ${String(sql || "").replace(/\s+/g, " ").slice(0, 230)}`); st.cteni += m.rows_read || 0; st.zapisy += m.rows_written || 0; st.dotazu++; return r; };
  const obalStmt = (s) => new Proxy(s, { get(t, k) {
    if (k === "bind") return (...a) => { const x = t.bind(...a); try { x.__sql = t.__sql; } catch {} return obalStmt(x); };
    if (k === "all" || k === "run") return async (...a) => pocitej(await t[k](...a), s.__sql);
    if (k === "first") return async (c) => { const r = pocitej(await t.all(), s.__sql); const x = r.results?.[0] ?? null; return c ? x?.[c] ?? null : x; };
    if (k === "__inner") return t;
    if (k === "__sql") return t.__sql;
    const v = t[k]; return typeof v === "function" ? v.bind(t) : v; } });
  return new Proxy(db, { get(t, k) {
    if (k === "prepare") return (sql) => { const x = t.prepare(sql); try { x.__sql = sql; } catch {} return obalStmt(x); };
    if (k === "batch") return async (l) => { const v = await t.batch(l.map((x) => x.__inner || x)); v.forEach((r, i) => pocitej(r, l[i].__sql)); return v; };
    const v = t[k]; return typeof v === "function" ? v.bind(t) : v; } });
}
export default {
  async fetch(req, env, ctx) {
    const st = { cteni: 0, zapisy: 0, dotazu: 0 };
    const t = Date.now();
    const r = await worker.fetch(req, { ...env, DB: obal(env.DB, st) }, ctx);
    const o = new Response(r.body, r);
    o.headers.set("x-rows-read", String(st.cteni)); o.headers.set("x-rows-written", String(st.zapisy)); o.headers.set("x-dotazu", String(st.dotazu)); o.headers.set("x-ms", String(Date.now() - t));
    return o;
  },
  scheduled: (...a) => worker.scheduled(...a),
};
