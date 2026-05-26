/** System message shown when an invitee enters the chat room (procedure step 9). */
export function formatInviteWelcomeContent(userName: string): string {
  const name = userName.trim() || "User";
  return `${name}님이 입장했습니다.`;
}
