import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

export const CHAT_ROOM_CHANNEL_PREFIX = "chat_room_channel_";
export const CHAT_MESSAGE_EVENT = "CHAT_MESSAGE";

export function chatRoomChannelName(roomId: string): string {
  return `${CHAT_ROOM_CHANNEL_PREFIX}${roomId.trim()}`;
}

/** Browser channel for chat room message broadcasts (ChatView). */
export function createChatRoomChannel(
  supabase: SupabaseClient,
  roomId: string
): RealtimeChannel {
  return supabase.channel(chatRoomChannelName(roomId));
}
