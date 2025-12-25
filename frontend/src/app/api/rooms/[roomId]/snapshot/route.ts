import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = { roomId: string };

type SnapshotRow = {
  room_id: string;
  snapshot_b64: string;
  updated_at: string;
  updated_by: string | null;
};

export async function GET(
  _req: Request,
  ctx: { params: Promise<Params> }
) {
  const { roomId } = await ctx.params;
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("room_snapshots")
    .select("room_id,snapshot_b64,updated_at,updated_by")
    .eq("room_id", roomId)
    .maybeSingle<SnapshotRow>();

  if (error) {
    return NextResponse.json(
      { error: "failed_to_load_snapshot" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    snapshotB64: data?.snapshot_b64 ?? null,
    updatedAt: data?.updated_at ?? null,
  });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<Params> }
) {
  const { roomId } = await ctx.params;
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

  const snapshotB64 = (body as Record<string, unknown>).snapshotB64;
  if (typeof snapshotB64 !== "string" || snapshotB64.length === 0) {
    return NextResponse.json({ error: "missing_snapshot" }, { status: 400 });
  }

  const { error } = await supabase.from("room_snapshots").upsert(
    {
      room_id: roomId,
      snapshot_b64: snapshotB64,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "room_id" }
  );

  if (error) {
    return NextResponse.json(
      {
        error: "failed_to_save_snapshot",
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
