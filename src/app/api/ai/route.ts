import { NextResponse } from 'next/server';

export class AIController {
    // AI 관련 요청 처리 로직
}

export async function GET(request: Request) {
    return NextResponse.json({ message: 'AI API Route' });
}

export async function POST(request: Request) {
    return NextResponse.json({ message: 'AI API Route - POST' });
}
