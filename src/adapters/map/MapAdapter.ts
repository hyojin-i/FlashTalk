export interface Coordinate {
    latitude: number;
    longitude: number;
}

export interface LocationResult extends Coordinate {
    id: string;
    placeName: string;
    address: string;
    distance?: number;
}

export interface MapAdapter {
    searchLocationByKeyword(keyword: string): Promise<LocationResult[]>;
    validateCoordinate(coordinates: Coordinate): boolean;
    getMapImage(coordinates: Coordinate): Promise<string>;
    reverseGeocode(coordinates: Coordinate): Promise<string>;
    calculateDistance(coords1: Coordinate, coords2: Coordinate): number;
}
