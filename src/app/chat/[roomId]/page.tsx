export default function ChatView({ params }: { params: { roomId: string } }) {
  return (
    <div>
      <h1>ChatView</h1>
      <p>Room ID: {params.roomId}</p>
    </div>
  );
}
