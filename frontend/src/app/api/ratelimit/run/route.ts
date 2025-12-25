import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const roomId = (body as Record<string, unknown>).roomId;
  if (typeof roomId !== "string" || roomId.length === 0) {
    return NextResponse.json({ error: "missing_roomId" }, { status: 400 });
  }

  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  // If Upstash isn't configured, don't block (free-tier local/dev friendly).
  if (!redisUrl || !redisToken) {
    return NextResponse.json({
      allowed: true,
      limit: null,
      windowSec: null,
      remaining: null,
      reset: null,
    });
  }

  try {
    const { Redis } = await import("@upstash/redis");
    const { Ratelimit } = await import("@upstash/ratelimit");

    const redis = new Redis({ url: redisUrl, token: redisToken });

    // Keep these in sync with the limiter below.
    const LIMIT = 3;
    const WINDOW_SEC = 60;

    const ratelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(LIMIT, `${WINDOW_SEC} s`),
      analytics: true,
      prefix: "pairpilot",
    });

    const key = `run:${roomId}:${user.id}`;
    const result = await ratelimit.limit(key);

    if (!result.success) {
      return NextResponse.json(
        {
          allowed: false,
          limit: LIMIT,
          windowSec: WINDOW_SEC,
          remaining: result.remaining,
          reset: result.reset,
        },
        { status: 429 }
      );
    }

    return NextResponse.json({
      allowed: true,
      limit: LIMIT,
      windowSec: WINDOW_SEC,
      remaining: result.remaining,
      reset: result.reset,
    });
  } catch {
    // Fail-open to avoid breaking the IDE if Upstash is flaky.
    return NextResponse.json({
      allowed: true,
      limit: null,
      windowSec: null,
      remaining: null,
      reset: null,
    });
  }
}
