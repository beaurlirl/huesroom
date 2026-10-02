import { track } from "@vercel/analytics";

export function trackPlayStart() {
  track("play_start");
}

export function trackHueClick() {
  track("hue_click");
}
