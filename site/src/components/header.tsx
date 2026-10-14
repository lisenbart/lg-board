import Image from "next/image";
import { BOARD_HOURS, BOARD_STUDIO } from "@/lib/work";

const links = [
  { href: "#work", label: "Work" },
  { href: "#studio", label: "Studio" },
  { href: "#enter", label: "Enter" },
  { href: "#contact", label: "Contact" },
];

export function Header() {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-4 px-4 py-4 sm:px-7 bg-linear-to-b from-bg/95 via-bg/70 to-transparent">
      <a href="#top" className="flex items-center gap-2.5 text-ink no-underline">
        <Image
          src="/tab-mark.png"
          alt=""
          width={32}
          height={32}
          className="size-8 rounded-lg bg-white object-contain p-0.5"
        />
        <span className="text-sm font-semibold tracking-tight">Lisenbart Games</span>
      </a>
      <nav className="flex items-center gap-4 sm:gap-5">
        {links.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="hidden text-[13px] font-medium text-muted no-underline hover:text-ink sm:inline"
          >
            {item.label}
          </a>
        ))}
        <a
          href={BOARD_HOURS}
          className="text-[13px] font-medium text-yellow no-underline hover:brightness-110"
        >
          Hours
        </a>
        <a
          href={BOARD_STUDIO}
          className="rounded-full bg-yellow px-3.5 py-1.5 text-[13px] font-semibold text-[#1a1030] no-underline hover:brightness-105"
        >
          Studio
        </a>
      </nav>
    </header>
  );
}
