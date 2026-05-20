import {
  INVITE_TO_ROOM_EVENT,
  type InviteToRoomPayload,
  userPresenceChannelName,
} from "@/lib/presence-channel";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

/** Sends `INVITE_TO_ROOM` on each invitee's private presence channel. */
export async function broadcastInviteToRoom(
  invitedUserIds: string[],
  payload: InviteToRoomPayload
): Promise<void> {
  if (invitedUserIds.length === 0) return;

  const supabase = getSupabaseAdminClient();

  await Promise.all(
    invitedUserIds.map(async (userId) => {
      const channelName = userPresenceChannelName(userId);
      const channel = supabase.channel(channelName);
      try {
        const status = await channel.send({
          type: "broadcast",
          event: INVITE_TO_ROOM_EVENT,
          payload,
        });
        if (status !== "ok") {
          console.warn(
            `[broadcastInviteToRoom] ${channelName} send status=${status}`
          );
        }
      } finally {
        await supabase.removeChannel(channel);
      }
    })
  );
}
