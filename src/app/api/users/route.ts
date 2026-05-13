import { NextResponse } from 'next/server';

export class UserController {
    // 사용자 관리 로직
}

export class UserSearchController {
    // 사용자 검색 로직
}

export async function GET(request: Request) {
    return NextResponse.json({ message: 'Users API Route' });
}

export async function POST(request: Request) {
    return NextResponse.json({ message: 'Users API Route - POST' });
}
