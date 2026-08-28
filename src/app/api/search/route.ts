import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

type Row = { id: string; phone: string; email: string | null };

async function runDuckDBSearch(id: string): Promise<Row | null> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const duckdb = require("duckdb");
  const parquetUrl = process.env.PARQUET_URL!;

  return new Promise((resolve, reject) => {
    const db = new duckdb.Database(":memory:");

    db.exec("INSTALL httpfs; LOAD httpfs;", (err: Error | null) => {
      if (err) {
        // httpfs might already be available (built-in), continue anyway
      }

      db.all(
        `SELECT id::VARCHAR AS id,
                '+'||phone::VARCHAR AS phone,
                email
         FROM parquet_scan('${parquetUrl}')
         WHERE id = ${BigInt(id)}
         LIMIT 1`,
        (err2: Error | null, rows: Record<string, unknown>[]) => {
          db.close();
          if (err2) return reject(err2);
          if (!rows || rows.length === 0) return resolve(null);
          resolve({
            id: String(rows[0].id),
            phone: String(rows[0].phone),
            email: rows[0].email != null ? String(rows[0].email) : null,
          });
        }
      );
    });
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
    const row = await runDuckDBSearch(id);
    return NextResponse.json({ rows: row ? [row] : [] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "query error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
