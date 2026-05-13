import { NextResponse } from 'next/server';

export class MapSearchController {
    // 맵 데이터 조회 및 검색 로직
}

export async function GET(request: Request) {
    return NextResponse.json({ message: 'Map API Route' });
}

export async function POST(request: Request) {
    return NextResponse.json({ message: 'Map API Route - POST' });
}
