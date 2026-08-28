import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

function extractIdFromUrl(raw: string): string | null {
  let url = raw.trim();
  if (!url.includes("://")) url = "https://" + url;

  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/$/, "");
    const segments = path.split("/").filter(Boolean);

    // facebook.com/profile.php?id=XXXXX
    const idParam = u.searchParams.get("id");
    if (idParam && /^\d{6,}$/.test(idParam)) return idParam;

    // facebook.com/groups/XXXXX or facebook.com/pages/name/XXXXX
    // check second segment if numeric
    if (segments.length >= 2 && /^\d{6,}$/.test(segments[segments.length - 1])) {
      return segments[segments.length - 1];
    }

    // facebook.com/NUMERIC_ID  (no username, just digits)
    if (segments.length === 1 && /^\d{6,}$/.test(segments[0])) return segments[0];

    // video / reel / post URLs often end with numeric ID
    const last = segments[segments.length - 1];
    if (/^\d{8,}$/.test(last)) return last;

    // story_fbid param
    const storyId = u.searchParams.get("story_fbid") ?? u.searchParams.get("fbid");
    if (storyId && /^\d{6,}$/.test(storyId)) return storyId;

  } catch { /* ignore */ }

  // last resort: extract any 15-digit number from the URL string
  const m = raw.match(/\b(1\d{14})\b/);
  if (m) return m[1];

  return null;
}

async function tryGraphApi(username: string): Promise<string | null> {
  // Try Facebook Graph API (works for pages/public profiles without token)
  try {
    const res = await fetch(`https://graph.facebook.com/${username}?fields=id`, {
      headers: { "User-Agent": "facebookexternalhit/1.1" },
    });
    if (res.ok) {
      const d = await res.json();
      if (d.id && /^\d+$/.test(d.id)) return d.id;
    }
  } catch { /* ignore */ }
  return null;
}

async function scrapeId(url: string): Promise<string | null> {
  const normalised = url.includes("://") ? url : "https://" + url;

  // Extract username from URL and try Graph API first
  try {
    const u = new URL(normalised);
    const segments = u.pathname.split("/").filter(Boolean);
    if (segments.length === 1 && !/^\d+$/.test(segments[0]) && segments[0] !== "profile.php") {
      const graphId = await tryGraphApi(segments[0]);
      if (graphId) return graphId;
    }
  } catch { /* ignore */ }

  const UA = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";

  try {
    const res = await fetch(normalised, {
      headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
      redirect: "follow",
    });

    // check if Facebook redirected to a URL with numeric ID
    const finalUrl = res.url;
    const fromUrl = extractIdFromUrl(finalUrl);
    if (fromUrl) return fromUrl;

    const html = await res.text();

    const patterns = [
      /"userID"\s*:\s*"(\d+)"/,
      /"USER_ID"\s*:\s*"(\d+)"/,
      /"pageID"\s*:\s*"(\d+)"/,
      /"entity_id"\s*:\s*"(\d+)"/,
      /"profile_id"\s*:\s*"(\d+)"/,
      /\\"userID\\":\\"(\d+)\\"/,
      /\\"entity_id\\":\\"(\d+)\\"/,
      /"owner"\s*:\s*\{"id"\s*:\s*"(\d+)"/,
      /"actorID"\s*:\s*"(\d+)"/,
      /data-userid="(\d+)"/,
      /content="https?:\/\/www\.facebook\.com\/(\d{8,})"/,
      /fb:\/\/profile\/(\d+)/,
      /"id"\s*:\s*"(\d{10,})"/,
    ];

    for (const pat of patterns) {
      const m = html.match(pat);
      if (m && /^\d{6,}$/.test(m[1])) return m[1];
    }
  } catch { /* ignore */ }

  // retry with mobile UA
  try {
    const mobileUrl = normalised.replace("www.facebook.com", "m.facebook.com");
    const res = await fetch(mobileUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15",
        "Accept-Language": "en-US",
      },
      redirect: "follow",
    });
    const html = await res.text();
    const m = html.match(/entity_id["\s:]+(\d{8,})/);
    if (m) return m[1];
    const m2 = html.match(/"id"\s*:\s*"(\d{10,})"/);
    if (m2) return m2[1];
  } catch { /* ignore */ }

  return null;
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

  const trimmed = url.trim();

  // already a numeric ID
  if (/^\d{6,}$/.test(trimmed)) return NextResponse.json({ id: trimmed });

  // try URL pattern extraction first (fast, no network)
  let id = extractIdFromUrl(trimmed);

  // if not found, try scraping
  if (!id) id = await scrapeId(trimmed);

  if (!id) {
    return NextResponse.json(
      { error: "تعذّر استخراج الـ ID — جرّب تنسخ الـ ID مباشرة من رابط البروفايل (facebook.com/profile.php?id=XXXXX)" },
      { status: 422 }
    );
  }

  return NextResponse.json({ id });
}
