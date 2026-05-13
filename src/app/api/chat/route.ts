import { NextResponse } from 'next/server';

export class ChatRoomController {
    // 채팅방 관리 로직
}

export async function GET(request: Request) {
    return NextResponse.json({ message: 'Chat API Route' });
}

export async function POST(request: Request) {
    return NextResponse.json({ message: 'Chat API Route - POST' });
}
