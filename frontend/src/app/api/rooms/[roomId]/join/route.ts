import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = { roomId: string };

type MemberRow = {
  room_id: string;
  user_id: string;
  role: "owner" | "editor" | "viewer";
};

type RoomOwnerRow = {
  created_by: string;
};

export async function POST(
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

  // Ensure membership exists.
  const { data: memberExisting, error: memSelErr } = await supabase
    .from("room_members")
    .select("room_id,user_id,role")
    .eq("room_id", roomId)
    .eq("user_id", user.id)
    .maybeSingle<MemberRow>();

  if (memSelErr) {
    return NextResponse.json(
      {
        error: "failed_to_read_membership",
        message: memSelErr.message,
        details: memSelErr.details,
        hint: memSelErr.hint,
        code: memSelErr.code,
      },
      { status: 500 }
    );
  }

  if (memberExisting) {
    const { data: ownerRow } = await supabase
      .from("rooms")
      .select("created_by")
      .eq("id", roomId)
      .maybeSingle<RoomOwnerRow>();

    return NextResponse.json({
      ok: true,
      role: memberExisting.role,
      ownerId: ownerRow?.created_by ?? null,
    });
  }

  // If the room already exists and I'm the creator, ensure I'm owner.
  // This prevents the creator from accidentally becoming a viewer due to the
  // "viewer-first" join flow.
  const { data: roomExisting, error: roomExistingErr } = await supabase
    .from("rooms")
    .select("created_by")
    .eq("id", roomId)
    .maybeSingle<RoomOwnerRow>();

  if (roomExistingErr) {
    return NextResponse.json(
      {
        error: "failed_to_read_room",
        message: roomExistingErr.message,
        details: roomExistingErr.details,
        hint: roomExistingErr.hint,
        code: roomExistingErr.code,
      },
      { status: 500 }
    );
  }

  if (roomExisting && roomExisting.created_by === user.id) {
    const up = await supabase.from("room_members").upsert(
      {
        room_id: roomId,
        user_id: user.id,
        role: "owner",
      },
      {
        onConflict: "room_id,user_id",
      }
    );

    if (up.error) {
      return NextResponse.json(
        {
          error: "failed_to_ensure_owner_membership",
          message: up.error.message,
          details: up.error.details,
          hint: up.error.hint,
          code: up.error.code,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      role: "owner",
      ownerId: user.id,
    });
  }

  // IMPORTANT: With RLS, a non-member typically can't SELECT the room row.
  // So we try to join as a viewer first. If that fails due to FK (room missing),
  // we create the room and join as owner.
  const attemptViewerJoin = await supabase
    .from("room_members")
    .insert({ room_id: roomId, user_id: user.id, role: "viewer" });

  if (!attemptViewerJoin.error) {
    const { data: ownerRow } = await supabase
      .from("rooms")
      .select("created_by")
      .eq("id", roomId)
      .maybeSingle<RoomOwnerRow>();

    return NextResponse.json({
      ok: true,
      role: "viewer",
      ownerId: ownerRow?.created_by ?? null,
    });
  }

  // If viewer join fails due to RLS/permissions, surface the details.
  // (If it failed due to FK because room doesn't exist, we handle it below.)
  const viewerErr = attemptViewerJoin.error;
  if (viewerErr && viewerErr.code && viewerErr.code !== "23503") {
    return NextResponse.json(
      {
        error: "failed_to_create_membership",
        message: viewerErr.message,
        details: viewerErr.details,
        hint: viewerErr.hint,
        code: viewerErr.code,
      },
      { status: 500 }
    );
  }

  // If viewer insert failed (likely room doesn't exist), try creating the room.
  const createRoom = await supabase
    .from("rooms")
    .insert({ id: roomId, created_by: user.id });

  if (createRoom.error) {
    if (createRoom.error.code === "23505") {
      // Room already exists (likely hidden by RLS). Retry viewer join.
      const retryViewerJoin = await supabase
        .from("room_members")
        .insert({ room_id: roomId, user_id: user.id, role: "viewer" });

      if (!retryViewerJoin.error) {
        const { data: ownerRow } = await supabase
          .from("rooms")
          .select("created_by")
          .eq("id", roomId)
          .maybeSingle<RoomOwnerRow>();

        return NextResponse.json({
          ok: true,
          role: "viewer",
          ownerId: ownerRow?.created_by ?? null,
        });
      }
    }

    // Most common cause here is: room already exists but RLS prevented us from seeing it,
    // or a duplicate key from retry. Return details.
    return NextResponse.json(
      {
        error: "failed_to_create_room",
        message: createRoom.error.message,
        details: createRoom.error.details,
        hint: createRoom.error.hint,
        code: createRoom.error.code,
      },
      { status: 500 }
    );
  }

  const createOwnerMembership = await supabase.from("room_members").insert({
    room_id: roomId,
    user_id: user.id,
    role: "owner",
  });

  if (createOwnerMembership.error) {
    return NextResponse.json(
      {
        error: "failed_to_create_membership",
        message: createOwnerMembership.error.message,
        details: createOwnerMembership.error.details,
        hint: createOwnerMembership.error.hint,
        code: createOwnerMembership.error.code,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, role: "owner", ownerId: user.id });
}
