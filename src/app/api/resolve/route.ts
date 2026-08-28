import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

function extractIdFromUrl(url: string): string | null {
  try {
    const u = new URL(url.includes("://") ? url : "https://" + url);

    // facebook.com/profile.php?id=XXXXX
    const idParam = u.searchParams.get("id");
    if (idParam && /^\d+$/.test(idParam)) return idParam;

    const segments = u.pathname.split("/").filter(Boolean);

    // facebook.com/NUMERIC_ID
    if (segments.length === 1 && /^\d{8,}$/.test(segments[0])) return segments[0];

    // video/post: facebook.com/video/XXXXXXX or /posts/XXXXXXX
    const last = segments[segments.length - 1];
    if (/^\d{8,}$/.test(last)) return last;

    return null; // username — needs scraping
  } catch {
    return null;
  }
}

async function scrapeIdFromPage(url: string): Promise<string | null> {
  const normalised = url.includes("://") ? url : "https://" + url;
  try {
    const res = await fetch(normalised, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });
    const html = await res.text();

    // Patterns found in Facebook's HTML
    const patterns = [
      /"userID"\s*:\s*"(\d+)"/,
      /"USER_ID"\s*:\s*"(\d+)"/,
      /"pageID"\s*:\s*"(\d+)"/,
      /"entity_id"\s*:\s*"(\d+)"/,
      /\\"userID\\":\\"(\d+)\\"/,
      /content="https:\/\/www\.facebook\.com\/(\d+)"/,
      /"profile_id"\s*:\s*"(\d+)"/,
      /"owner_id"\s*:\s*"(\d+)"/,
      /data-referrerid="(\d+)"/,
    ];

    for (const pat of patterns) {
      const m = html.match(pat);
      if (m) return m[1];
    }

    return null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get("auth")?.value;
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
    await jwtVerify(token, secret);
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { url } = await req.json();
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });

  // already a numeric ID
  if (/^\d{8,}$/.test(url.trim())) {
    return NextResponse.json({ id: url.trim() });
  }

  let id = extractIdFromUrl(url);
  if (!id) {
    id = await scrapeIdFromPage(url);
  }

  if (!id) {
    return NextResponse.json({ error: "لم أتمكن من استخراج الـ ID من هذا الرابط" }, { status: 422 });
  }

  return NextResponse.json({ id });
}
