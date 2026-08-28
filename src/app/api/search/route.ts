import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

async function queryDuckDB(id: string): Promise<{ id: string; phone: string; email: string | null } | null> {
  // Dynamic import to avoid bundling issues
  const duckdb = await import("duckdb");
  const Database = duckdb.default ?? duckdb;

  return new Promise((resolve, reject) => {
    const db = new (Database as any)(":memory:");
    db.all(
      `INSTALL httpfs; LOAD httpfs;
       SELECT id::VARCHAR AS id, '+'||phone::VARCHAR AS phone, email
       FROM parquet_scan('${process.env.PARQUET_URL}')
       WHERE id = ${BigInt(id)}
       LIMIT 1`,
      (err: Error | null, rows: Record<string, unknown>[]) => {
        db.close();
        if (err) reject(err);
        else resolve(rows?.[0] ? {
          id: String(rows[0].id),
          phone: String(rows[0].phone),
          email: rows[0].email != null ? String(rows[0].email) : null,
        } : null);
      }
    );
  });
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get("auth")?.value;
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
    await jwtVerify(token, secret);
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id || !/^\d{6,}$/.test(id)) {
    return NextResponse.json({ error: "id مطلوب" }, { status: 400 });
  }

  if (!process.env.PARQUET_URL) {
    return NextResponse.json({ error: "PARQUET_URL not configured" }, { status: 500 });
  }

  try {
    const row = await queryDuckDB(id);
    if (!row) return NextResponse.json({ rows: [] });
    return NextResponse.json({ rows: [row] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "query error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
