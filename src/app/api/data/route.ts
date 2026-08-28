import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

export async function GET(req: NextRequest) {
  // verify auth cookie
  const token = req.cookies.get("auth")?.value;
  if (!token) return new NextResponse("Unauthorized", { status: 401 });
  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
    await jwtVerify(token, secret);
  } catch {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const parquetUrl = process.env.PARQUET_URL;
  if (!parquetUrl) return new NextResponse("PARQUET_URL not configured", { status: 500 });

  const range = req.headers.get("range") ?? "";
  const upstreamRes = await fetch(parquetUrl, {
    headers: range ? { range } : {},
  });

  const headers = new Headers();
  ["content-type", "content-length", "content-range", "accept-ranges"].forEach((h) => {
    const v = upstreamRes.headers.get(h);
    if (v) headers.set(h, v);
  });
  headers.set("accept-ranges", "bytes");

  return new NextResponse(upstreamRes.body, {
    status: upstreamRes.status,
    headers,
  });
}
