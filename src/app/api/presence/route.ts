import { NextResponse } from 'next/server';

export class UserPresenceController {
    // 사용자 상태 관리 로직
}

export async function GET(request: Request) {
    return NextResponse.json({ message: 'Presence API Route' });
}

export async function POST(request: Request) {
    return NextResponse.json({ message: 'Presence API Route - POST' });
}
