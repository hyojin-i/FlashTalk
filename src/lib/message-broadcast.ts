import type { Message } from "@/domain/message/Message";
import {
  CHAT_MESSAGE_EVENT,
  chatRoomChannelName,
} from "@/lib/chat-room-channel";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import type { ChatMessagePayload } from "@/lib/message-payload";
import { messageToPayload } from "@/lib/message-payload";
import type { SupabaseClient } from "@supabase/supabase-js";

const SUBSCRIBE_TIMEOUT_MS = 10_000;

async function sendMessageOnChannel(
  supabase: SupabaseClient,
  roomId: string,
  payload: ChatMessagePayload
): Promise<void> {
  const channelName = chatRoomChannelName(roomId);
  const channel = supabase.channel(channelName);

  try {
    await new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(
          new Error(
            `[broadcastMessageToRoom] subscribe timeout (${SUBSCRIBE_TIMEOUT_MS}ms): ${channelName}`
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
                `[broadcastMessageToRoom] subscribe ${status}: ${channelName}`
              )
          );
        }
      });
    });

    const status = await channel.send({
      type: "broadcast",
      event: CHAT_MESSAGE_EVENT,
      payload,
    });

    if (status !== "ok") {
      throw new Error(
        `[broadcastMessageToRoom] send status=${status} channel=${channelName}`
      );
    }
  } finally {
    await supabase.removeChannel(channel);
  }
}

/** Sends a chat message on `chat_room_channel_{roomId}`. */
export async function broadcastMessageToRoom(
  roomId: string,
  message: Message
): Promise<void> {
  const payload = { ...messageToPayload(message), roomId: roomId.trim() };
  const supabase = getSupabaseAdminClient();
  await sendMessageOnChannel(supabase, roomId, payload);
}

/** Sends a system payload (e.g. USER_LEFT) on `chat_room_channel_{roomId}`. */
export async function broadcastPayloadToRoom(
  roomId: string,
  payload: ChatMessagePayload
): Promise<void> {
  const supabase = getSupabaseAdminClient();
  await sendMessageOnChannel(supabase, roomId, {
    ...payload,
    roomId: roomId.trim(),
  });
}
