import Image from "next/image";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { BOARD_HOURS, BOARD_STUDIO, MAIL, WORK } from "@/lib/work";

export default function Home() {
  return (
    <div id="top" className="flex min-h-dvh flex-col">
      <Header />
      <main className="flex flex-1 flex-col">
        <section className="flex flex-col items-center px-4 pb-16 pt-6 text-center sm:px-6 sm:pb-20 sm:pt-8">
          <p className="m-0 text-[12px] font-medium tracking-[0.22em] text-muted uppercase">
            Animation studio · Odesa
          </p>
          <div className="mt-5 mb-2 w-[min(340px,82vw)] rounded-[28px] bg-white px-5 py-4 shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
            <Image
              src="/logo.png"
              alt="Lisenbart Games Animation"
              width={420}
              height={280}
              priority
              className="h-auto w-full"
            />
          </div>
          <h1 className="mt-2 max-w-[18ch] text-[clamp(28px,5vw,48px)] leading-[1.1] font-semibold tracking-[-0.04em]">
            Motion for games.
          </h1>
          <p className="mt-4 max-w-xl text-[clamp(16px,2.2vw,19px)] leading-relaxed font-normal text-[#d9d3e4]">
            Slot features, bonus games, and character work for iGaming. SuperPlay MGX
            is on the floor this month. Playables is next.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a
              href="#work"
              className="inline-flex min-h-12 items-center rounded-full bg-yellow px-6 text-[15px] font-semibold text-[#1a1030] no-underline hover:brightness-105"
            >
              See the work
            </a>
            <a
              href="#enter"
              className="inline-flex min-h-12 items-center rounded-full border border-white/15 px-6 text-[15px] font-medium text-ink no-underline hover:border-yellow/50"
            >
              Enter the desk
            </a>
          </div>
        </section>

        <section id="work" className="mx-auto w-[min(1080px,calc(100%-32px))] scroll-mt-20 pb-16 sm:w-[min(1080px,calc(100%-48px))]">
          <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="m-0 text-[12px] font-medium tracking-[0.22em] text-muted uppercase">
                SuperPlay MGX
              </p>
              <h2 className="mt-2 text-[clamp(24px,3vw,32px)] font-semibold tracking-[-0.04em]">
                On the board this month
              </h2>
            </div>
            <p className="m-0 max-w-sm text-sm leading-relaxed text-[#d9d3e4] sm:text-right">
              Real titles from October 2026. DD and DX lines. The same list SuperPlay
              hours and invoices are based on.
            </p>
          </div>
          <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {WORK.map((piece) => (
              <li
                key={`${piece.line}-${piece.title}`}
                className="flex min-h-[132px] flex-col justify-between rounded-2xl border border-white/10 bg-card p-5"
              >
                <span
                  className={`inline-flex w-fit rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-[0.14em] uppercase ${
                    piece.line === "DX"
                      ? "bg-navy/80 text-yellow"
                      : "bg-magenta/25 text-[#ffb7dc]"
                  }`}
                >
                  {piece.line}
                </span>
                <div>
                  <strong className="block text-lg font-semibold tracking-tight">
                    {piece.title}
                  </strong>
                  <span className="mt-1 block text-[13px] text-muted">{piece.kind}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section
          id="studio"
          className="mx-auto grid w-[min(1080px,calc(100%-32px))] scroll-mt-20 grid-cols-1 gap-8 border-t border-white/10 py-14 sm:w-[min(1080px,calc(100%-48px))] lg:grid-cols-[0.9fr_1.1fr]"
        >
          <div>
            <p className="m-0 text-[12px] font-medium tracking-[0.22em] text-muted uppercase">
              The studio
            </p>
            <h2 className="mt-2.5 mb-3 text-[clamp(24px,3vw,32px)] font-semibold tracking-[-0.04em] leading-tight">
              A small motion crew. One month at a time.
            </h2>
            <p className="m-0 text-base leading-relaxed text-[#d9d3e4]">
              Lisenbart Games Animation is based in Odesa. We take a brief, put the
              file on disk, and ship the motion. SuperPlay is the live client.
              Designers stay on our desk — not on Monday.
            </p>
          </div>
          <ul className="m-0 grid list-none gap-3 p-0">
            <li className="grid gap-1.5 rounded-2xl border border-white/10 bg-card px-[18px] py-4">
              <b className="text-[13px] tracking-[0.12em] text-yellow uppercase">MGX</b>
              <span className="text-[15px] leading-snug text-[#d9d3e4]">
                DD, DX, and DS for SuperPlay. Playables stays off this site until that
                slice is live.
              </span>
            </li>
            <li className="grid gap-1.5 rounded-2xl border border-white/10 bg-card px-[18px] py-4">
              <b className="text-[13px] tracking-[0.12em] text-yellow uppercase">Hours</b>
              <span className="text-[15px] leading-snug text-[#d9d3e4]">
                Shifts × 9. SuperPlay sees project, shifts, hours — the same numbers
                the invoices use. No studio queue, no rates.
              </span>
            </li>
            <li className="grid gap-1.5 rounded-2xl border border-white/10 bg-card px-[18px] py-4">
              <b className="text-[13px] tracking-[0.12em] text-yellow uppercase">Files</b>
              <span className="text-[15px] leading-snug text-[#d9d3e4]">
                A job is a card, a Drive folder, and a brief Doc. Ready → WIP →
                Fix → Done → Senior Approval → Closed.
              </span>
            </li>
          </ul>
        </section>

        <section id="enter" className="mx-auto w-[min(640px,calc(100%-32px))] scroll-mt-20 pb-6 text-center sm:w-[min(640px,calc(100%-48px))]">
          <p className="m-0 text-[12px] font-medium tracking-[0.22em] text-muted uppercase">
            Enter
          </p>
          <h2 className="mt-2.5 text-[clamp(24px,3vw,32px)] font-semibold tracking-[-0.04em]">
            Two doors. PIN lives on the desk.
          </h2>
          <div className="mt-8 grid grid-cols-1 gap-3.5 text-left sm:grid-cols-2">
            <a
              href={BOARD_STUDIO}
              className="flex min-h-[168px] flex-col gap-1.5 rounded-[18px] bg-yellow px-[22px] py-5 text-[#1a1030] no-underline shadow-[0_14px_32px_rgba(255,213,74,0.18)] hover:brightness-105"
            >
              <span className="text-[11px] font-semibold tracking-[0.16em] text-[#5a3f12] uppercase">
                Crew
              </span>
              <strong className="text-[28px] font-semibold tracking-[-0.04em]">Studio</strong>
              <span className="mt-auto text-sm leading-snug text-[#5a3f12]">
                Pipeline, load, briefs, Drive. PIN at the board.
              </span>
            </a>
            <a
              href={BOARD_HOURS}
              className="flex min-h-[168px] flex-col gap-1.5 rounded-[18px] border border-white/10 bg-card px-[22px] py-5 text-ink no-underline hover:-translate-y-0.5 hover:border-yellow/45"
            >
              <span className="text-[11px] font-semibold tracking-[0.16em] text-muted uppercase">
                SuperPlay
              </span>
              <strong className="text-[28px] font-semibold tracking-[-0.04em]">Client</strong>
              <span className="mt-auto text-sm leading-snug text-[#d9d3e4]">
                Hours only: project, shifts, hours. No studio queue.
              </span>
            </a>
          </div>
          <p className="mt-4 text-xs text-muted">
            This page is the public face. Seats and PIN stay on the desk — not here.
          </p>
        </section>

        <section
          id="contact"
          className="mx-auto w-[min(640px,calc(100%-32px))] scroll-mt-20 border-t border-white/10 py-14 text-center sm:w-[min(640px,calc(100%-48px))]"
        >
          <p className="m-0 text-[12px] font-medium tracking-[0.22em] text-muted uppercase">
            Contact
          </p>
          <h2 className="mt-2.5 text-[clamp(24px,3vw,32px)] font-semibold tracking-[-0.04em]">
            New work, or a question on MGX.
          </h2>
          <p className="mx-auto mt-3 max-w-md text-base leading-relaxed text-[#d9d3e4]">
            Write Dmytro. We answer from the studio, not a generic inbox.
          </p>
          <a
            href={`mailto:${MAIL}`}
            className="mt-6 inline-flex min-h-12 items-center rounded-full bg-ink px-6 text-[15px] font-semibold text-bg no-underline hover:bg-white"
          >
            {MAIL}
          </a>
        </section>
      </main>
      <Footer />
    </div>
  );
}
