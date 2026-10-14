import { BOARD_HOURS, BOARD_STUDIO, MAIL } from "@/lib/work";

export function Footer() {
  return (
    <footer className="mt-auto flex flex-wrap items-center justify-center gap-2 px-6 pb-8 pt-4 text-xs text-muted">
      <span>lisenbart.games</span>
      <span aria-hidden="true" className="opacity-50">
        ·
      </span>
      <a href={BOARD_STUDIO} className="text-ink no-underline hover:text-yellow">
        studio board
      </a>
      <span aria-hidden="true" className="opacity-50">
        ·
      </span>
      <a href={BOARD_HOURS} className="text-ink no-underline hover:text-yellow">
        hours
      </a>
      <span aria-hidden="true" className="opacity-50">
        ·
      </span>
      <a href={`mailto:${MAIL}`} className="text-ink no-underline hover:text-yellow">
        {MAIL}
      </a>
    </footer>
  );
}
