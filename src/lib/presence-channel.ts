export const INVITE_TO_ROOM_EVENT = "INVITE_TO_ROOM";

export function userPresenceChannelName(userId: string): string {
  return `user_presence_channel_${userId}`;
}

export type InviteToRoomPayload = {
  roomId: string;
  inviterUserId: string;
};
