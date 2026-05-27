import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

export const INVITE_TO_ROOM_EVENT = "INVITE_TO_ROOM";

/** Shared prefix — server broadcast and MainView subscribe must use this helper. */
export const USER_PRESENCE_CHANNEL_PREFIX = "user_presence_channel_";

export function normalizeUserId(userId: string): string {
  return userId.trim();
}

/** Per-user Realtime topic: `user_presence_channel_{userId}` */
export function userPresenceChannelName(userId: string): string {
  return `${USER_PRESENCE_CHANNEL_PREFIX}${normalizeUserId(userId)}`;
}

/** Browser channel for presence + invite broadcasts (MainView). */
export function createUserPresenceChannel(
  supabase: SupabaseClient,
  userId: string
): RealtimeChannel {
  const id = normalizeUserId(userId);
  return supabase.channel(userPresenceChannelName(id), {
    config: {
      presence: { key: id },
      broadcast: { ack: false, self: false },
    },
  });
}

export type InviteToRoomPayload = {
  roomId: string;
  inviterUserId: string;
  inviterName: string;
};
