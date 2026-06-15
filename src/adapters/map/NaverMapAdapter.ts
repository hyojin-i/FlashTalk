import { MapAdapter, LocationResult, Coordinate } from './MapAdapter';
import axios from 'axios';
import { externalEndpoints } from '@/lib/externalEndpoints';

export class NaverMapAdapter implements MapAdapter {
    private readonly searchClientId = process.env.NAVER_MAP_CLIENT_ID || ""; 
    private readonly searchClientSecret = process.env.NAVER_MAP_CLIENT_SECRET || "";
    private readonly ncpClientId = process.env.NCP_CLIENT_ID || this.searchClientId; 
    private readonly ncpClientSecret = process.env.NCP_CLIENT_SECRET || this.searchClientSecret;

    async searchLocationByKeyword(keyword: string): Promise<LocationResult[]> {
        try {
            const response = await axios.get(externalEndpoints.map.naverSearch, {
                params: { query: keyword, display: 5 },
                headers: { 
                    'X-Naver-Client-Id': this.searchClientId, 
                    'X-Naver-Client-Secret': this.searchClientSecret 
                },
                timeout: 5000
            });
            const mappedResults: LocationResult[] = response.data.items.map((item: any, index: number) => ({
                id: `naver_loc_${Date.now()}_${index}`,
                placeName: item.title.replace(/<[^>]*>?/g, '').trim(),
                address: (item.roadAddress || item.address || '').trim(),
                latitude: parseFloat(item.mapy) / 10000000,
                longitude: parseFloat(item.mapx) / 10000000
            }));
            
            return mappedResults.filter(loc => this.validateCoordinate({ latitude: loc.latitude, longitude: loc.longitude }) && loc.placeName && loc.address);
        } catch (error) {
            console.error("Naver Search API Error:", error);
            return []; 
        }
    }

    validateCoordinate(coordinates: Coordinate): boolean {
        if (!coordinates || isNaN(coordinates.latitude) || isNaN(coordinates.longitude)) return false;
        return (coordinates.latitude >= -90 && coordinates.latitude <= 90) && 
               (coordinates.longitude >= -180 && coordinates.longitude <= 180);
    }

    async getMapImage(coordinates: Coordinate): Promise<string> {
        if (!this.validateCoordinate(coordinates)) return "";
        
        const center = `${coordinates.longitude},${coordinates.latitude}`;
        const markerString = `type:d|size:mid|color:red|pos:${coordinates.longitude} ${coordinates.latitude}`;

        const encodedMarkers = encodeURIComponent(markerString);
        const encodedSecret = encodeURIComponent(this.ncpClientSecret);
        
        return `https://maps.apigw.ntruss.com/map-static/v2/raster?w=600&h=400&center=${center}&level=16&markers=${encodedMarkers}&X-NCP-APIGW-API-KEY-ID=${this.ncpClientId}&X-NCP-APIGW-API-KEY=${encodedSecret}`;
    }

    async reverseGeocode(coordinates: Coordinate): Promise<string> {
        if (!this.validateCoordinate(coordinates)) return "현재 위치";
        
        const url = `https://maps.apigw.ntruss.com/map-reversegeocode/v2/gc`;

        try {
            const response = await axios.get(url, {
                params: { 
                    coords: `${coordinates.longitude},${coordinates.latitude}`, 
                    orders: 'admcode,legalcode,addr,roadaddr', 
                    output: 'json' 
                },
                headers: { 
                    'X-NCP-APIGW-API-KEY-ID': this.ncpClientId,
                    'X-NCP-APIGW-API-KEY': this.ncpClientSecret 
                },
                timeout: 5000
            });
            
            const results = response.data.results;
            if (!results || results.length === 0) return "주소를 찾을 수 없는 위치";
            
            const region = results[0].region;
            const land = results[0].land;
            const fullAddress = `${region.area1?.name || ''} ${region.area2?.name || ''} ${region.area3?.name || ''} ${land?.name || ''} ${land?.number1 || ''}`;
            return fullAddress.replace(/\s+/g, ' ').trim() || "현재 위치";
        } catch (error) {
            console.error("Reverse Geocode Error:", error);
            return "현재 위치"; 
        }
    }

    calculateDistance(coords1: Coordinate, coords2: Coordinate): number {
        const R = 6371e3; 
        const φ1 = coords1.latitude * Math.PI / 180, φ2 = coords2.latitude * Math.PI / 180;
        const Δφ = (coords2.latitude - coords1.latitude) * Math.PI / 180;
        const Δλ = (coords2.longitude - coords1.longitude) * Math.PI / 180; 
        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        return Math.round(R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))));
    }
}
