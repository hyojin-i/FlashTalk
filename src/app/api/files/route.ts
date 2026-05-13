import { NextResponse } from 'next/server';

export class FileController {
    // 파일 업로드, 다운로드 등 관리 로직
}

export async function GET(request: Request) {
    return NextResponse.json({ message: 'Files API Route' });
}

export async function POST(request: Request) {
    return NextResponse.json({ message: 'Files API Route - POST' });
}
