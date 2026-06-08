// app/api/cron/cleanup/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
  const authHeader = request.headers.get('Authorization'); // 보안 검증 (시크릿 토큰 확인)
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const supabaseAdmin = createClient( // Admin 클라이언트 생성
    process.env.NEXT_PUBLIC_SUPABASE_URL!, 
    process.env.SUPABASE_SECRET_KEY! 
  );

  const targetTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // 24시간 전 시간 계산

  try {
    const { data: files, error: fetchError } = await supabaseAdmin // 24시간이 지난 파일 목록 조회
      .from('FileInfo')
      .select('filePath')
      .lt('uploadedAt', targetTime);

    if (fetchError) throw fetchError;
    if (!files || files.length === 0) {
      return NextResponse.json({ message: '삭제할 파일이 없습니다.' });
    }

    const filePaths = files.map(f => f.filePath);
    const { error: storageError } = await supabaseAdmin // Storage 버킷에서 파일 일괄 삭제 
      .storage
      .from('chat-files') 
      .remove(filePaths);

    if (storageError) throw storageError;

    const { error: deleteError } = await supabaseAdmin // FileInfo 테이블 행(Row) 삭제
      .from('FileInfo')
      .delete()
      .lt('uploadedAt', targetTime);

    if (deleteError) throw deleteError;

    return NextResponse.json({ success: true, deletedCount: files.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}