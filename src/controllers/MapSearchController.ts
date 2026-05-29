import { MapAdapter, Coordinate } from '../adapters/map/MapAdapter';

export class MapSearchController {
    constructor(private readonly mapAdapter: MapAdapter) {}

    async searchPlaceWithDistance(keyword: string, myLat?: number, myLng?: number) {
        if (!keyword || keyword.trim() === "") throw new Error("검색어가 없습니다.");
        let results = await this.mapAdapter.searchLocationByKeyword(keyword);
        
        if (myLat === undefined || myLng === undefined) return results;
        
        const myCoords: Coordinate = { latitude: myLat, longitude: myLng };
        if (!this.mapAdapter.validateCoordinate(myCoords)) return results;
        
        return results.map(loc => ({
            ...loc, distance: this.mapAdapter.calculateDistance(myCoords, { latitude: loc.latitude, longitude: loc.longitude })
        })).sort((a, b) => (a.distance || 0) - (b.distance || 0));
    }

    async getValidatedMap(lat: number, lng: number) {
        const target: Coordinate = { latitude: lat, longitude: lng };
        if (!this.mapAdapter.validateCoordinate(target)) throw new Error("유효하지 않은 장소입니다.");
        const realAddress = await this.mapAdapter.reverseGeocode(target);
        if (realAddress === "주소를 찾을 수 없는 위치") throw new Error("서비스하지 않는 지역입니다.");
        
        return { imageUrl: await this.mapAdapter.getMapImage(target), verifiedAddress: realAddress };
    }

    async getAddressFromGPS(lat: number, lng: number) {
        const target: Coordinate = { latitude: lat, longitude: lng };
        
        return { address: await this.mapAdapter.reverseGeocode(target), imageUrl: await this.mapAdapter.getMapImage(target) };
    }
}
