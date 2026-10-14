export type WorkPiece = {
  title: string;
  line: "DX" | "DD";
  kind: string;
};

/** Live SuperPlay MGX titles from the studio desk this month. */
export const WORK: WorkPiece[] = [
  { title: "Halloween Match 2", line: "DX", kind: "Feature · 60s" },
  { title: "Grave Escape", line: "DX", kind: "Bonus · 60s" },
  { title: "Halloween Tower", line: "DX", kind: "Feature · 60s" },
  { title: "Interactive Halloween", line: "DX", kind: "Feature · 60s" },
  { title: "Halloween Mario", line: "DD", kind: "Feature · 30s" },
  { title: "Spooky Jackpot", line: "DD", kind: "Feature · 30s" },
  { title: "Witch’s Potion", line: "DD", kind: "Feature · 30s" },
  { title: "Halloween Kingdom Build", line: "DD", kind: "Feature · 60s" },
  { title: "Winning Circle", line: "DX", kind: "Feature" },
  { title: "Split Rally", line: "DX", kind: "Feature" },
  { title: "Make Your Move", line: "DX", kind: "Comp / MGX" },
  { title: "ASO Dreams", line: "DX", kind: "UA · 30s" },
];

export const BOARD_STUDIO = "https://board.lisenbart.games/?door=studio";
export const BOARD_HOURS = "https://board.lisenbart.games/hours";
export const MAIL = "dmytro@lisenbart.games";
