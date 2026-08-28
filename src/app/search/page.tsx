"use client";
import { useState, useRef, useCallback, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import * as duckdb from "@duckdb/duckdb-wasm";

type Row = { id: string; phone: string; email: string | null };
type DbState = "idle" | "loading" | "ready" | "error";

let dbInstance: duckdb.AsyncDuckDB | null = null;
let initPromise: Promise<void> | null = null;

async function initDB(): Promise<duckdb.AsyncDuckDB> {
  if (dbInstance) return dbInstance;
  if (!initPromise) {
    initPromise = (async () => {
      const JSDELIVR = duckdb.getJsDelivrBundles();
      const bundle = await duckdb.selectBundle(JSDELIVR);
      const worker = await duckdb.createWorker(bundle.mainWorker!);
      const logger = new duckdb.ConsoleLogger();
      const db = new duckdb.AsyncDuckDB(logger, worker);
      await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
      dbInstance = db;
    })();
  }
  await initPromise;
  return dbInstance!;
}

async function queryById(db: duckdb.AsyncDuckDB, id: string): Promise<Row[]> {
  const conn = await db.connect();
  try {
    const res = await conn.query(
      `SELECT id::VARCHAR AS id,
              '+'||phone::VARCHAR AS phone,
              email
       FROM parquet_scan('/api/data')
       WHERE id = ${BigInt(id)}`
    );
    return res.toArray().map((r: Record<string, unknown>) => ({
      id: String(r.id),
      phone: String(r.phone),
      email: r.email != null ? String(r.email) : null,
    }));
  } finally {
    await conn.close();
  }
}

function detectInput(q: string): "id" | "url" {
  const trimmed = q.trim();
  if (trimmed.includes("facebook.com") || trimmed.includes("fb.com") || trimmed.includes("://"))
    return "url";
  if (/^\d{8,}$/.test(trimmed)) return "id";
  return "url";
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [dbState, setDbState] = useState<DbState>("idle");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [resolvedId, setResolvedId] = useState("");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  // pre-warm DuckDB on mount
  useEffect(() => {
    setDbState("loading");
    initDB()
      .then(() => setDbState("ready"))
      .catch(() => setDbState("error"));
  }, []);

  const handleSearch = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const q = query.trim();
      if (!q) return;

      setSearching(true);
      setSearchError("");
      setRows([]);
      setResolvedId("");

      try {
        const db = await initDB();
        let id = q;

        if (detectInput(q) === "url") {
          const res = await fetch("/api/resolve", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: q }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "فشل استخراج الـ ID");
          id = data.id;
          setResolvedId(id);
        }

        const results = await queryById(db, id);
        setRows(results);
        if (results.length === 0) setSearchError("لا توجد نتائج");
      } catch (err: unknown) {
        setSearchError(err instanceof Error ? err.message : "خطأ غير متوقع");
      } finally {
        setSearching(false);
      }
    },
    [query]
  );

  async function handleLogout() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/");
  }

  return (
    <div className="min-h-screen flex flex-col p-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 mt-4">
        <h1 className="text-2xl font-bold text-white">🔍 بحث</h1>
        <div className="flex items-center gap-3">
          <span
            className={`text-xs px-2 py-1 rounded-full ${
              dbState === "ready"
                ? "bg-green-900 text-green-400"
                : dbState === "loading"
                ? "bg-yellow-900 text-yellow-400"
                : dbState === "error"
                ? "bg-red-900 text-red-400"
                : "bg-gray-800 text-gray-400"
            }`}
          >
            {dbState === "ready"
              ? "● جاهز"
              : dbState === "loading"
              ? "⏳ تحميل..."
              : dbState === "error"
              ? "✕ خطأ"
              : "○"}
          </span>
          <button
            onClick={handleLogout}
            className="text-gray-500 hover:text-gray-300 text-sm transition-colors"
          >
            خروج
          </button>
        </div>
      </div>

      {/* Search form */}
      <form onSubmit={handleSearch} className="flex gap-2 mb-2">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ID أو رابط فيسبوك..."
          className="flex-1 bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
          autoFocus
          dir="ltr"
        />
        <button
          type="submit"
          disabled={searching || dbState !== "ready"}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold px-5 py-3 rounded-xl transition-colors text-sm whitespace-nowrap"
        >
          {searching ? "⏳" : "بحث"}
        </button>
      </form>

      <p className="text-gray-600 text-xs mb-6">
        يقبل: رقم ID مباشرة · رابط صفحة · رابط بروفايل
      </p>

      {/* Resolved ID badge */}
      {resolvedId && (
        <div className="mb-4 bg-gray-900 border border-gray-800 rounded-lg px-4 py-2 text-sm text-gray-400">
          <span className="text-gray-600">ID المستخرج:</span>{" "}
          <span className="text-gray-200 font-mono">{resolvedId}</span>
        </div>
      )}

      {/* Error */}
      {searchError && (
        <div className="mb-4 bg-red-950 border border-red-900 rounded-xl px-4 py-3 text-red-400 text-sm">
          {searchError}
        </div>
      )}

      {/* Results */}
      {rows.length > 0 && (
        <div className="space-y-3">
          {rows.map((row, i) => (
            <div
              key={i}
              className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2"
            >
              <Row label="ID" value={row.id} mono />
              <Row label="تليفون" value={row.phone} mono />
              <Row label="إيميل" value={row.email ?? "—"} mono={!!row.email} dim={!row.email} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  dim,
}: {
  label: string;
  value: string;
  mono?: boolean;
  dim?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-gray-500 text-xs w-14 shrink-0 text-left">{label}</span>
      <span
        className={`text-sm break-all ${
          dim ? "text-gray-600" : "text-gray-100"
        } ${mono ? "font-mono" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}
