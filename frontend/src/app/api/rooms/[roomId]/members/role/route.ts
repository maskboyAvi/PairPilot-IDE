import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = { roomId: string };

type MemberRow = {
  room_id: string;
  user_id: string;
  role: "owner" | "editor" | "viewer";
};

type RoomRow = {
  created_by: string;
};

export async function POST(req: Request, ctx: { params: Promise<Params> }) {
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

  const targetUserId = (body as Record<string, unknown>).userId;
  const role = (body as Record<string, unknown>).role;

  if (typeof targetUserId !== "string" || targetUserId.length === 0) {
    return NextResponse.json({ error: "missing_userId" }, { status: 400 });
  }

  if (role !== "viewer" && role !== "editor") {
    return NextResponse.json({ error: "invalid_role" }, { status: 400 });
  }

  // Verify caller is owner (RLS also enforces this on update).
  const { data: meMember, error: meErr } = await supabase
    .from("room_members")
    .select("room_id,user_id,role")
    .eq("room_id", roomId)
    .eq("user_id", user.id)
    .maybeSingle<MemberRow>();

  if (meErr || !meMember || meMember.role !== "owner") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Never allow changing the creator's role away from owner.
  const { data: room, error: roomErr } = await supabase
    .from("rooms")
    .select("created_by")
    .eq("id", roomId)
    .maybeSingle<RoomRow>();

  if (roomErr || !room) {
    return NextResponse.json({ error: "room_not_found" }, { status: 404 });
  }

  if (targetUserId === room.created_by) {
    return NextResponse.json({ error: "cannot_change_owner" }, { status: 400 });
  }

  // Upsert membership (insert if missing, otherwise update).
  const up = await supabase.from("room_members").upsert(
    {
      room_id: roomId,
      user_id: targetUserId,
      role,
    },
    {
      onConflict: "room_id,user_id",
    }
  );

  if (up.error) {
    return NextResponse.json(
      {
        error: "failed_to_upsert_role",
        message: up.error.message,
        details: up.error.details,
        hint: up.error.hint,
        code: up.error.code,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
