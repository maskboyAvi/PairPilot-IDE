import { redirect } from "next/navigation";

export default async function JoinRoomRedirectPage(props: {
  searchParams: Promise<{ id?: string }>;
}) {
  const searchParams = await props.searchParams;
  const roomId = (searchParams.id || "").trim();

  if (!roomId) {
    redirect("/app");
  }

  redirect(`/room/${encodeURIComponent(roomId)}`);
}
