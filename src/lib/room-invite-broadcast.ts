import {
  INVITE_TO_ROOM_EVENT,
  type InviteToRoomPayload,
  userPresenceChannelName,
} from "@/lib/presence-channel";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import type { SupabaseClient } from "@supabase/supabase-js";

const SUBSCRIBE_TIMEOUT_MS = 10_000;

async function sendInviteOnChannel(
  supabase: SupabaseClient,
  invitedUserId: string,
  payload: InviteToRoomPayload
): Promise<void> {
  const channelName = userPresenceChannelName(invitedUserId);
  const channel = supabase.channel(channelName);

  try {
    await new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(
          new Error(
            `[broadcastInviteToRoom] subscribe timeout (${SUBSCRIBE_TIMEOUT_MS}ms): ${channelName}`
          )
        );
      }, SUBSCRIBE_TIMEOUT_MS);

      channel.subscribe((status, err) => {
        if (status === "SUBSCRIBED") {
          clearTimeout(timeoutId);
          resolve();
          return;
        }
        if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          clearTimeout(timeoutId);
          reject(
            err ??
              new Error(
                `[broadcastInviteToRoom] subscribe ${status}: ${channelName}`
              )
          );
        }
      });
    });

    const status = await channel.send({
      type: "broadcast",
      event: INVITE_TO_ROOM_EVENT,
      payload,
    });

    if (status !== "ok") {
      throw new Error(
        `[broadcastInviteToRoom] send status=${status} channel=${channelName}`
      );
    }
  } finally {
    await supabase.removeChannel(channel);
  }
}

/** Sends `INVITE_TO_ROOM` on each invitee's private presence channel. */
export async function broadcastInviteToRoom(
  invitedUserIds: string[],
  payload: InviteToRoomPayload
): Promise<void> {
  if (invitedUserIds.length === 0) return;

  const supabase = getSupabaseAdminClient();

  await Promise.all(
    invitedUserIds.map((userId) =>
      sendInviteOnChannel(supabase, userId, payload)
    )
  );
}
