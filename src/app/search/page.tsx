"use client";
import { useState, useRef, useCallback, FormEvent } from "react";
import { useRouter } from "next/navigation";

type Row = { id: string; phone: string; email: string | null };

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
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [resolvedId, setResolvedId] = useState("");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

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

        const res = await fetch(`/api/search?id=${encodeURIComponent(id)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "خطأ في البحث");
        setRows(data.rows ?? []);
        if ((data.rows ?? []).length === 0) setSearchError("لا توجد نتائج لهذا الـ ID");
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
      <div className="flex items-center justify-between mb-8 mt-4">
        <h1 className="text-2xl font-bold text-white">🔍 بحث</h1>
        <button
          onClick={handleLogout}
          className="text-gray-500 hover:text-gray-300 text-sm transition-colors"
        >
          خروج
        </button>
      </div>

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
          disabled={searching}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold px-5 py-3 rounded-xl transition-colors text-sm whitespace-nowrap"
        >
          {searching ? "⏳" : "بحث"}
        </button>
      </form>

      <p className="text-gray-600 text-xs mb-6">
        يقبل: رقم ID مباشرة · رابط صفحة · رابط بروفايل
      </p>

      {resolvedId && (
        <div className="mb-4 bg-gray-900 border border-gray-800 rounded-lg px-4 py-2 text-sm text-gray-400">
          <span className="text-gray-600">ID المستخرج:</span>{" "}
          <span className="text-gray-200 font-mono">{resolvedId}</span>
        </div>
      )}

      {searchError && (
        <div className="mb-4 bg-red-950 border border-red-900 rounded-xl px-4 py-3 text-red-400 text-sm">
          {searchError}
        </div>
      )}

      {rows.length > 0 && (
        <div className="space-y-3">
          {rows.map((row, i) => (
            <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2">
              <RowItem label="ID" value={row.id} mono />
              <RowItem label="تليفون" value={row.phone} mono />
              <RowItem label="إيميل" value={row.email ?? "—"} mono={!!row.email} dim={!row.email} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RowItem({ label, value, mono, dim }: { label: string; value: string; mono?: boolean; dim?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-gray-500 text-xs w-14 shrink-0 text-left">{label}</span>
      <span className={`text-sm break-all ${dim ? "text-gray-600" : "text-gray-100"} ${mono ? "font-mono" : ""}`}>
        {value}
      </span>
    </div>
  );
}
