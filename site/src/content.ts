export const EMAIL = "dmytro@lisenbart.games";
export const MAILTO = `mailto:${EMAIL}?subject=${encodeURIComponent("Brief — Lisenbart Games")}`;

export const VIMEO_ID = "944158555";

export const clients = ["Playtika", "Voodoo", "Moon Active", "Plarium"] as const;

export const frames = [
  {
    src: "/images/work/01.webp",
    alt: "Frame from the gaming reel: a nightclub scene with animal characters.",
  },
  {
    src: "/images/work/02.webp",
    alt: "Frame from the gaming reel: a character breaking through ice.",
  },
  {
    src: "/images/work/03.webp",
    alt: "Frame from the gaming reel: three mobile-game cuts, including Coin Master.",
  },
  {
    src: "/images/work/04.webp",
    alt: "Frame from the gaming reel: a 2D skeleton knight.",
  },
  {
    src: "/images/work/05.webp",
    alt: "Frame from the gaming reel: a vault heist with dog characters.",
  },
] as const;

export const services = [
  {
    n: "01",
    name: "Playable Ads",
    text: "Interactive playables and end cards from your game art, built for the networks you already buy.",
  },
  {
    n: "02",
    name: "Game Animation",
    text: "Character, UI and in-world motion for trailers, live-ops and in-game beats — 2D, 3D and mixed media.",
  },
  {
    n: "03",
    name: "Video Creatives",
    text: "UA and ASO cuts: launch trailers, store videos, seasonal spots. Fast iteration with the creative team.",
  },
  {
    n: "04",
    name: "Creative Direction & Storytelling",
    text: "The six-second story, the character, the feeling. AI and mixed media when they serve the frame — directed, not dumped.",
  },
] as const;
