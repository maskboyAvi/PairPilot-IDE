import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";
import { createRoom } from "./actions";
import Link from "next/link";

type RoomRow = {
  id: string;
  created_at: string;
  created_by: string;
};

type MemberRow = {
  room_id: string;
  role: "owner" | "editor" | "viewer";
  created_at: string;
};
export default async function AppPage(props: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const searchParams = (await props.searchParams) ?? {};
  const createdView = searchParams.created ?? "";
  const joinedView = searchParams.joined ?? "";
  const createdPage = Number(searchParams.createdPage ?? "1") || 1;
  const joinedPage = Number(searchParams.joinedPage ?? "1") || 1;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect("/login?error=Please%20sign%20in%20first");
  }

  const userId = data.user.id;
  const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
  const usernameRaw = typeof meta.username === "string" ? meta.username : "";
  const username = usernameRaw || (data.user.email?.split("@")[0] ?? "user");

  const { data: createdRooms } = await supabase
    .from("rooms")
    .select("id,created_at,created_by")
    .eq("created_by", userId)
    .order("created_at", { ascending: false })
    .returns<RoomRow[]>();

  const { data: memberships } = await supabase
    .from("room_members")
    .select("room_id,role,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .returns<MemberRow[]>();

  const createdRoomIds = new Set((createdRooms ?? []).map((r) => r.id));
  const joinedRooms = (memberships ?? []).filter(
    (m) => !createdRoomIds.has(m.room_id)
  );

  const createdAll = createdView === "all";
  const joinedAll = joinedView === "all";

  const createdTotal = (createdRooms ?? []).length;
  const joinedTotal = joinedRooms.length;

  const pageSizeCollapsed = 3;
  const pageSizeExpanded = 10;

  const createdPageSize = createdAll ? pageSizeExpanded : pageSizeCollapsed;
  const joinedPageSize = joinedAll ? pageSizeExpanded : pageSizeCollapsed;

  const createdStart = createdAll ? (createdPage - 1) * createdPageSize : 0;
  const joinedStart = joinedAll ? (joinedPage - 1) * joinedPageSize : 0;

  const createdShown = (createdRooms ?? []).slice(
    createdStart,
    createdStart + createdPageSize
  );
  const joinedShown = joinedRooms.slice(
    joinedStart,
    joinedStart + joinedPageSize
  );

  const createdHasMore = createdTotal > createdShown.length;
  const joinedHasMore = joinedTotal > joinedShown.length;

  const createdMaxPage = Math.max(
    1,
    Math.ceil(createdTotal / pageSizeExpanded)
  );
  const joinedMaxPage = Math.max(1, Math.ceil(joinedTotal / pageSizeExpanded));

  return (
    <main className="pp-page">
      <div className="pp-container">
        <div className="pp-topbar">
          <div className="pp-brand">
            <div className="pp-title">PairPilot IDE</div>
            <div className="pp-subtle">Lobby</div>
          </div>
          <div className="pp-row">
            <span className="pp-subtle">Welcome, {username}</span>
            <form action={signOut}>
              <button type="submit" className="pp-buttonSecondary">
                Sign out
              </button>
            </form>
          </div>
        </div>

        <div className="pp-authGrid">
          <div className="pp-card" style={{ marginTop: 18 }}>
            <h1
              style={{ fontSize: 26, fontWeight: 900, letterSpacing: "-0.6px" }}
            >
              Create a room
            </h1>
            <p className="pp-subtle" style={{ marginTop: 8 }}>
              Anyone can join as a viewer. Promote editors from the People menu.
            </p>

            <div className="pp-row" style={{ marginTop: 14 }}>
              <form action={createRoom}>
                <button type="submit" className="pp-button">
                  Create room
                </button>
              </form>
            </div>
          </div>

          <div className="pp-card" style={{ marginTop: 18 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800 }}>Join a room</h2>
            <p className="pp-subtle" style={{ marginTop: 8 }}>
              Paste a room code to enter.
            </p>
            <form
              action="/room"
              method="get"
              className="pp-row"
              style={{ marginTop: 12 }}
            >
              <input
                className="pp-input"
                name="id"
                placeholder="e.g. abcd-efgh"
              />
              <button type="submit" className="pp-buttonSecondary">
                Join
              </button>
            </form>
          </div>
        </div>

        <div className="pp-card" style={{ marginTop: 35 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800 }}>Your rooms</h2>
          <p className="pp-subtle" style={{ marginTop: 8 }}>
            Rooms you created (owner).
          </p>
          {createdTotal === 0 ? (
            <p className="pp-subtle" style={{ marginTop: 10 }}>
              (none yet)
            </p>
          ) : (
            <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
              {createdShown.map((r) => (
                <div
                  key={r.id}
                  className="pp-row"
                  style={{ justifyContent: "space-between" }}
                >
                  <div>
                    <div style={{ fontWeight: 800 }}>{r.id}</div>
                    <div className="pp-subtle">role: owner</div>
                  </div>
                  <a
                    className="pp-buttonSecondary"
                    href={`/room/${encodeURIComponent(r.id)}`}
                  >
                    Open
                  </a>
                </div>
              ))}

              <div
                className="pp-row"
                style={{ justifyContent: "space-between", marginTop: 6 }}
              >
                {!createdAll && createdTotal > pageSizeCollapsed ? (
                  <Link
                    className="pp-linkButton"
                    href="/app?created=all&createdPage=1"
                  >
                    Expand
                  </Link>
                ) : null}

                {createdAll && createdTotal > pageSizeExpanded ? (
                  <div className="pp-row" style={{ gap: 8 }}>
                    <Link
                      className="pp-linkButton"
                      href={`/app?created=all&createdPage=${Math.max(
                        1,
                        createdPage - 1
                      )}`}
                      aria-disabled={createdPage <= 1}
                    >
                      Prev
                    </Link>
                    <span className="pp-subtle">
                      Page {Math.min(createdMaxPage, createdPage)} /{" "}
                      {createdMaxPage}
                    </span>
                    <Link
                      className="pp-linkButton"
                      href={`/app?created=all&createdPage=${Math.min(
                        createdMaxPage,
                        createdPage + 1
                      )}`}
                      aria-disabled={createdPage >= createdMaxPage}
                    >
                      Next
                    </Link>
                    <Link className="pp-linkButton" href="/app">
                      Collapse
                    </Link>
                  </div>
                ) : createdAll ? (
                  <Link className="pp-linkButton" href="/app">
                    Collapse
                  </Link>
                ) : createdHasMore ? (
                  <span className="pp-subtle">
                    Showing {createdShown.length} of {createdTotal}
                  </span>
                ) : null}
              </div>
            </div>
          )}
        </div>

        <div className="pp-card">
          <h2 style={{ fontSize: 18, fontWeight: 800 }}>Joined rooms</h2>
          <p className="pp-subtle" style={{ marginTop: 8 }}>
            Rooms you joined as an editor/viewer.
          </p>
          {joinedTotal === 0 ? (
            <p className="pp-subtle" style={{ marginTop: 10 }}>
              (none yet)
            </p>
          ) : (
            <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
              {joinedShown.map((m) => (
                <div
                  key={m.room_id}
                  className="pp-row"
                  style={{ justifyContent: "space-between" }}
                >
                  <div>
                    <div style={{ fontWeight: 800 }}>{m.room_id}</div>
                    <div className="pp-subtle">role: {m.role}</div>
                  </div>
                  <a
                    className="pp-buttonSecondary"
                    href={`/room/${encodeURIComponent(m.room_id)}`}
                  >
                    Open
                  </a>
                </div>
              ))}

              <div
                className="pp-row"
                style={{ justifyContent: "space-between", marginTop: 6 }}
              >
                {!joinedAll && joinedTotal > pageSizeCollapsed ? (
                  <Link
                    className="pp-linkButton"
                    href="/app?joined=all&joinedPage=1"
                  >
                    Expand
                  </Link>
                ) : null}

                {joinedAll && joinedTotal > pageSizeExpanded ? (
                  <div className="pp-row" style={{ gap: 8 }}>
                    <Link
                      className="pp-linkButton"
                      href={`/app?joined=all&joinedPage=${Math.max(
                        1,
                        joinedPage - 1
                      )}`}
                      aria-disabled={joinedPage <= 1}
                    >
                      Prev
                    </Link>
                    <span className="pp-subtle">
                      Page {Math.min(joinedMaxPage, joinedPage)} /{" "}
                      {joinedMaxPage}
                    </span>
                    <Link
                      className="pp-linkButton"
                      href={`/app?joined=all&joinedPage=${Math.min(
                        joinedMaxPage,
                        joinedPage + 1
                      )}`}
                      aria-disabled={joinedPage >= joinedMaxPage}
                    >
                      Next
                    </Link>
                    <Link className="pp-linkButton" href="/app">
                      Collapse
                    </Link>
                  </div>
                ) : joinedAll ? (
                  <Link className="pp-linkButton" href="/app">
                    Collapse
                  </Link>
                ) : joinedHasMore ? (
                  <span className="pp-subtle">
                    Showing {joinedShown.length} of {joinedTotal}
                  </span>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
