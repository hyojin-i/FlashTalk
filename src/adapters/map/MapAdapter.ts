export interface MapAdapter {
    searchLocation(query: string): Promise<any>;
    getMapImage(lat: number, lng: number): Promise<string>;
    // 맵 연동에 필요한 추가 메서드 정의
}
