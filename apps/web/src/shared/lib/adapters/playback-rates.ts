import { MediaType } from "@omioroom/contracts";

const DEFAULT_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

/** Speeds a source can actually play at; an empty list means the source cannot change speed at all. */
export function availableRates(type: MediaType | undefined): number[] {
  // VK's embed API has no speed control
  if (type === MediaType.VK) return [];
  return DEFAULT_RATES;
}
