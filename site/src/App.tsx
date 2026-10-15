import { FormEvent, ReactNode, useEffect, useState } from "react";

const asset = (file: string) => {
  const base = import.meta.env.BASE_URL === "/" ? "./" : import.meta.env.BASE_URL;
  return `${base}assets/${file}`;
};

const services = [
  {
    number: "01",
    title: "Trailers & cinematics",
    copy: "Launch trailers and story cinematics that make players want in. 2D or 3D.",
    tone: "yellow",
  },
  {
    number: "02",
    title: "Ad creatives",
    copy: "UA videos built around the hook, cut for every network.",
    tone: "white",
  },
  {
    number: "03",
    title: "Playable ads",
    copy: "HTML5 playables that let the game sell itself.",
    tone: "pink",
  },
  {
    number: "04",
    title: "In-game motion & art",
    copy: "Feature reveals, characters and the art that keeps a live game feeling fresh.",
    tone: "white",
  },
];

const principles = [
  {
    number: "01",
    title: "Idea before polish",
    copy: "Before anything gets pretty, we agree with you on one idea: what the player should feel, and why they'll hit install.",
  },
  {
    number: "02",
    title: "One creative lead, no handoffs",
    copy: "The person who pitches you the idea is the one who delivers it. Nothing gets lost in translation.",
  },
  {
    number: "03",
    title: "Craft that ships",
    copy: "Beautiful and late is still late. We plan for both: your quality bar and your launch date.",
  },
];

const facts: { title: string; copy: ReactNode }[] = [
  {
    title: "Since 2006",
    copy: "Twenty years of animation from Kyiv, for clients across Europe and North America.",
  },
  {
    title: "Brands",
    copy: "500+ animated commercials, including campaigns for Nestlé, Samsung, McDonald's and Mastercard.",
  },
  {
    title: "Film",
    copy: (
      <>
        <a
          className="text-link"
          href="https://www.imdb.com/title/tt14760808/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Unnecessary Things
        </a>
        {". Co-produced with Marcus Film. 11 awards, 45 festival selections, a Golden Goblet nomination at Shanghai and an official selection at Huesca (Oscar-qualifying)."}
      </>
    ),
  },
];

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 19 19 5M8 5h11v11" />
    </svg>
  );
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <span className={`menu-icon ${open ? "is-open" : ""}`} aria-hidden="true">
      <i />
      <i />
    </span>
  );
}

function LogoWord({ children }: { children: string }) {
  return (
    <span className="logo-word" aria-label={children}>
      {Array.from(children).map((letter, index) => (
        <span aria-hidden="true" key={`${letter}-${index}`}>
          {letter}
        </span>
      ))}
    </span>
  );
}

function FilmLockup({ children }: { children: ReactNode }) {
  return (
    <span className="film-lockup">
      {children}
      <img
        src={asset("lisenbart-film-mark.png")}
        alt=""
        width={146}
        height={146}
      />
    </span>
  );
}

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [showReel, setShowReel] = useState(false);
  const [formSent, setFormSent] = useState(false);

  useEffect(() => {
    if (!showReel) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowReel(false);
    };
    document.body.classList.add("no-scroll");
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.classList.remove("no-scroll");
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [showReel]);

  useEffect(() => {
    const root = document.documentElement;
    const sections = Array.from(document.querySelectorAll("main > section:not(.hero)"));
    const items = Array.from(
      document.querySelectorAll(
        ".service-card, .principle-grid article, .facts-grid article",
      ),
    );
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    root.classList.add("motion-ready");
    sections.forEach((section) => section.classList.add("reveal-section"));
    items.forEach((item) => item.classList.add("reveal-item"));

    if (reducedMotion || !("IntersectionObserver" in window)) {
      sections.forEach((section) => section.classList.add("is-visible"));
      items.forEach((item) => item.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.08 },
    );

    sections.forEach((section) => observer.observe(section));
    items.forEach((item) => observer.observe(item));

    return () => observer.disconnect();
  }, []);

  const closeMenu = () => setMenuOpen(false);

  const submitBrief = (event: FormEvent<HTMLFormElement>) => {
    const form = event.currentTarget;
    const data = new FormData(form);
    if (data.get("bot-field")) {
      event.preventDefault();
      return;
    }

    const host = window.location.hostname;
    const hostedForms = host === "lisenbart.games" || host.endsWith(".netlify.app");
    if (hostedForms) return;

    event.preventDefault();
    const body = [
      `Name: ${data.get("name") || ""}`,
      `Email: ${data.get("email") || ""}`,
      `Company: ${data.get("company") || ""}`,
      `Need: ${data.get("need") || ""}`,
      "",
      `${data.get("message") || ""}`,
    ].join("\n");
    window.location.href = `mailto:info@lisenbart.games?subject=${encodeURIComponent(
      "Brief — Lisenbart Games",
    )}&body=${encodeURIComponent(body)}`;
    setFormSent(true);
  };

  return (
    <div className="site-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Lisenbart Games home">
          <img src={asset("lisenbart-full.png")} alt="Lisenbart Games Animation" />
        </a>

        <nav className={`main-nav ${menuOpen ? "is-open" : ""}`} aria-label="Main navigation">
          <a href="#showreel" onClick={closeMenu}>
            Showreel
          </a>
          <a href="#services" onClick={closeMenu}>
            Services
          </a>
          <a href="#about" onClick={closeMenu}>
            About
          </a>
          <a href="#contact" onClick={closeMenu}>
            Contact
          </a>
          <a className="nav-cta" href="#contact" onClick={closeMenu}>
            Start a project <ArrowIcon />
          </a>
        </nav>

        <button
          className="menu-button"
          type="button"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((current) => !current)}
        >
          <MenuIcon open={menuOpen} />
        </button>
      </header>

      <main id="top">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">For game studios, publishers & agencies</p>
            <h1 aria-label="Animation that sells games">
              Animation that{" "}
              <span>
                sells <strong>games</strong>
              </span>
            </h1>
            <p className="hero-lead">
              Trailers, ad creatives, playables and in-game animation for your
              mobile and PC games. Crafted like film, built to perform.
            </p>
            <div className="hero-actions">
              <a className="primary-button" href="#contact">
                Start a project <ArrowIcon />
              </a>
            </div>
          </div>

          <button
            className="hero-reel"
            type="button"
            id="showreel"
            onClick={() => setShowReel(true)}
            aria-label="Play Lisenbart Games showreel"
          >
            <img
              src={asset("showreel-poster.jpg")}
              alt="Animated game characters outside The Milk nightclub"
            />
            <span className="reel-shade" />
            <span className="reel-meta">
              <span>Showreel</span>
            </span>
            <span className="play-button">
              <img
                src={asset("lisenbart-mark.webp")}
                alt=""
                width={128}
                height={128}
              />
              <span>Play reel</span>
            </span>
          </button>
        </section>

        <section className="services-section" id="services">
          <div className="section-intro">
            <p className="eyebrow">Services</p>
            <div>
              <h2>
                What we <LogoWord>make</LogoWord>
              </h2>
              <p>
                Think of us as your in-house animation team, without the hiring.
              </p>
            </div>
          </div>

          <div className="service-grid">
            {services.map((service) => (
              <article className={`service-card ${service.tone}`} key={service.number}>
                <span>{service.number}</span>
                <h3>{service.title}</h3>
                <p>{service.copy}</p>
              </article>
            ))}
          </div>
        </section>

        <aside className="clients-strip" aria-label="Trusted by game teams at">
          <p className="clients-strip-label">Trusted by game teams at</p>
          <p className="clients-strip-names">
            Playtika · Moon Active · Voodoo · Plarium
          </p>
          <p className="clients-strip-note">
            plus a mobile games publisher under NDA
          </p>
        </aside>

        <section className="thinking-section">
          <div className="thinking-heading">
            <h2>How we work</h2>
            <p className="thinking-lead">
              Every frame has a job: stop the scroll, show the game, earn the
              install.
            </p>
          </div>

          <div className="principle-grid">
            {principles.map((principle) => (
              <article key={principle.number}>
                <span>{principle.number}</span>
                <h3>{principle.title}</h3>
                <p>{principle.copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="about-section" id="about">
          <div className="about-heading">
            <h2>
              <span className="title-sells">
                Built <strong>on</strong>
              </span>
              <FilmLockup>LISENBART FILM</FilmLockup>
            </h2>
          </div>

          <p className="about-lead">
            Lisenbart Games is part of Lisenbart Film, an independent
            animation studio founded in Kyiv in 2006. Everything we learned
            making commercials and award-winning films now goes into your
            trailers, ads and playables.
          </p>

          <div className="facts-grid">
            {facts.map((fact) => (
              <article key={fact.title}>
                <h3>{fact.title}</h3>
                <p>{fact.copy}</p>
              </article>
            ))}
          </div>

          <div className="about-footer">
            <p className="founder">
              Founded by Dmytro Lisenbart — 25 years in animation and game
              cinematics, former head of Ukranimafilm, Ukraine’s national
              animation studio.
            </p>

            <div className="about-actions">
              <a
                className="secondary-button"
                href="https://lisenbart.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                Explore Lisenbart Film <ArrowIcon />
              </a>
              <a
                className="text-link"
                href="https://www.imdb.com/name/nm11412621/"
                target="_blank"
                rel="noopener noreferrer"
              >
                IMDb <ArrowIcon />
              </a>
            </div>
          </div>
        </section>

        <section className="contact-section" id="contact">
          <div className="contact-copy">
            <p className="eyebrow">Start a project</p>
            <h2>
              Got a <LogoWord>game</LogoWord> to launch?
            </h2>
            <p>
              Tell us about your game and what you need. You'll hear back within
              one business day.
            </p>
          </div>

          <form
            className="brief-form"
            name="brief"
            method="POST"
            data-netlify="true"
            netlify-honeypot="bot-field"
            onSubmit={submitBrief}
          >
            <p className="form-intro">
              Send the brief. We reply within one business day.
            </p>
            <input type="hidden" name="form-name" value="brief" />
            <p className="hp">
              <label>
                Leave blank
                <input name="bot-field" tabIndex={-1} autoComplete="off" />
              </label>
            </p>

            <div className="form-grid">
              <label>
                <span>Name*</span>
                <input type="text" name="name" autoComplete="name" required />
              </label>
              <label>
                <span>Work email*</span>
                <input type="email" name="email" autoComplete="email" required />
              </label>
              <label>
                <span>Company</span>
                <input type="text" name="company" autoComplete="organization" />
              </label>
              <label>
                <span>What do you need?</span>
                <select name="need" defaultValue="">
                  <option value="" disabled>
                    Select
                  </option>
                  <option>Trailer / cinematic</option>
                  <option>Ad creatives</option>
                  <option>Playable ads</option>
                  <option>In-game motion & art</option>
                  <option>Other</option>
                </select>
              </label>
              <label className="message-field">
                <span>Message*</span>
                <textarea name="message" rows={4} required />
              </label>
            </div>

            <div className="form-footer">
              <button className="primary-button" type="submit">
                Send brief <ArrowIcon />
              </button>
              <div className="contact-direct">
                <span>Prefer email?</span>
                <a href="mailto:info@lisenbart.games">
                  <span>
                    <strong>Email us</strong>
                    <small>info@lisenbart.games</small>
                  </span>
                  <ArrowIcon />
                </a>
              </div>
              {formSent && <p>Got it. You'll hear from us within one business day.</p>}
            </div>
          </form>
        </section>
      </main>

      <footer>
        <div className="footer-brand">
          <img src={asset("lisenbart-full.png")} alt="" />
          <a href="https://lisenbart.com" target="_blank" rel="noopener noreferrer">
            Part of <FilmLockup>Lisenbart Film</FilmLockup>
          </a>
        </div>
        <div className="footer-links">
          <span>© {new Date().getFullYear()} Lisenbart Games</span>
          <div className="footer-nav">
            <a
              href="https://www.linkedin.com/company/74503932"
              target="_blank"
              rel="noopener noreferrer"
            >
              LinkedIn
            </a>
          </div>
        </div>
      </footer>

      {showReel && (
        <div className="reel-modal" role="dialog" aria-modal="true" aria-label="Lisenbart Games showreel">
          <button type="button" onClick={() => setShowReel(false)} aria-label="Close showreel">
            Close <span>×</span>
          </button>
          <div className="video-frame">
            <iframe
              src="https://player.vimeo.com/video/944158555?autoplay=1&dnt=1&title=0&byline=0&portrait=0"
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
              title="Lisenbart Games showreel"
            />
          </div>
        </div>
      )}
    </div>
  );
}
