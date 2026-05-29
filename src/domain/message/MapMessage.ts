import { Message } from './Message';

export interface MapMessageContent {
    placeName: string;
    address: string;
    latitude: number;
    longitude: number;
    mapImageUrl: string;
    distanceFromSender?: number;
}

export class MapMessage extends Message {
    placeName: string;
    address: string;
    latitude: number;
    longitude: number;
    mapImageUrl: string;
    distanceFromSender?: number;

    constructor(
        id: string, senderId: string, createdAt: Date, 
        placeName: string, address: string, latitude: number, longitude: number, 
        mapImageUrl: string, distanceFromSender?: number
    ) {
        super(id, senderId, createdAt);
        this.placeName = placeName;
        this.address = address;
        this.latitude = latitude;
        this.longitude = longitude;
        this.mapImageUrl = mapImageUrl;
        this.distanceFromSender = distanceFromSender;
    }

     getContent(): MapMessageContent {
        return {
            placeName: this.placeName,
            address: this.address,
            latitude: this.latitude,
            longitude: this.longitude,
            mapImageUrl: this.mapImageUrl,
            distanceFromSender: this.distanceFromSender
        };
    }

   renderMessage(): { uiType: "MAP_CARD"; data: MapMessageContent } {
        return {
            uiType: "MAP_CARD",
            data: this.getContent()
        };
    }
}