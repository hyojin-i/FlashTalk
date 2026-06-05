import { NextResponse } from 'next/server';
import { AdminController } from '@/controllers/AdminController';
import { getUserIdFromRequest } from '@/lib/auth-request';

const adminController = new AdminController();

export async function GET(request: Request) {
    try {
        const adminId = await getUserIdFromRequest(request);
        if (!adminId) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });

        const users = await adminController.getAllUsers(adminId);
        return NextResponse.json({ ok: true, users }, { status: 200 });
    } catch (e: any) {
        console.error("[GET /api/admin]", e);
        return NextResponse.json({ ok: false, error: e.message || "Failed to load users" }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const adminId = await getUserIdFromRequest(request);
        if (!adminId) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const targetUserId = searchParams.get("userId");

        if (!targetUserId) {
            return NextResponse.json({ ok: false, error: "Target userId is required" }, { status: 400 });
        }

        await adminController.deleteUser(adminId, targetUserId);
        return NextResponse.json({ ok: true }, { status: 200 });
    } catch (e: any) {
        console.error("[DELETE /api/admin]", e);
        return NextResponse.json({ ok: false, error: e.message || "Failed to delete user" }, { status: 500 });
    }
}
