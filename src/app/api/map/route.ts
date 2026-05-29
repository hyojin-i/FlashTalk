import { NextResponse } from 'next/server';
import { NaverMapAdapter } from '@/adapters/map/NaverMapAdapter';
import { MapSearchController } from '@/controllers/MapSearchController';

const mapController = new MapSearchController(new NaverMapAdapter());

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    try {
        if (action === 'search') return NextResponse.json({ success: true, results: await mapController.searchPlaceWithDistance(searchParams.get('keyword') || '', searchParams.get('lat') ? parseFloat(searchParams.get('lat')!) : undefined, searchParams.get('lng') ? parseFloat(searchParams.get('lng')!) : undefined) });
        if (action === 'image') return NextResponse.json({ success: true, ...(await mapController.getValidatedMap(parseFloat(searchParams.get('lat') || '0'), parseFloat(searchParams.get('lng') || '0'))) });
        if (action === 'gps') return NextResponse.json({ success: true, ...(await mapController.getAddressFromGPS(parseFloat(searchParams.get('lat') || '0'), parseFloat(searchParams.get('lng') || '0'))) });
        return NextResponse.json({ success: false, message: "Invalid Action" }, { status: 400 });
    } catch (error: any) {
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
}
