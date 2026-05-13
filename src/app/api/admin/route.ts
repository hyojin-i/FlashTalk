import { NextResponse } from 'next/server';

export class AdminController {
    // 관리자 기능 처리 로직
}

export async function GET(request: Request) {
    return NextResponse.json({ message: 'Admin API Route' });
}

export async function POST(request: Request) {
    return NextResponse.json({ message: 'Admin API Route - POST' });
}
