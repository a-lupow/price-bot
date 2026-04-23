import EventEmitter from "node:events";
import type { NewScrapedListing } from "./db/schema.js";

type NewAdEvent = {
  content: NewScrapedListing,
}

type NewPriceEvent = {
  content: NewScrapedListing,
}

type EventMap = {
  newAd: [NewAdEvent],
  newPrice: [NewPriceEvent],
}

export const messageBus = new EventEmitter<EventMap>()
