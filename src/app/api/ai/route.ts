import { NextResponse } from 'next/server';
import { AIController } from '@/controllers/AIController';

const aiController = new AIController();

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { action, prompt, timeout, model } = body;

        if (timeout || model) {
            aiController.updateSettings(timeout, model);
        }

        if (action === 'generate') {
            const response = await aiController.requestAi(prompt);
            return NextResponse.json({ result: response });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');
    const model = searchParams.get('model');

    if (model) aiController.updateSettings(undefined, model);

    if (action === 'status') {
        const isOnline = await aiController.checkConnection();
        return NextResponse.json({ status: isOnline ? 'online' : 'offline' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
