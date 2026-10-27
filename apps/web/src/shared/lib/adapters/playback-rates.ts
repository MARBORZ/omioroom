import { MediaType } from "@omioroom/contracts";

const DEFAULT_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];
const YOUTUBE_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const RUTUBE_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

/** Speeds a source can actually play at; an empty list means the source cannot change speed at all. */
export function availableRates(type: MediaType | undefined): number[] {
  // VK's embed API has no speed control: disable with tooltip
  if (type === MediaType.VK || type === MediaType.OK) return [];
  // YouTube and RuTube support fixed discrete rate steps
  if (type === MediaType.YOUTUBE) return YOUTUBE_RATES;
  if (type === MediaType.RUTUBE) return RUTUBE_RATES;
  return DEFAULT_RATES;
}
