import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";

const asset = (file: string) => {
  const base = import.meta.env.BASE_URL === "/" ? "./" : import.meta.env.BASE_URL;
  return `${base}assets/${file}`;
};

const productionGroups = [
  {
    number: "01",
    title: "Creative Production",
    tagline: "Your assets. Our production.",
    copy: "Video ads, variations, localisation and motion graphics. Fast, consistent production that fits your budget and workflow.",
    tone: "yellow",
    services: [
      { title: "Ad creatives", icon: "icon-creatives.png" },
      { title: "Ad variants & localisation", icon: "icon-variants.png" },
      { title: "Store & ASO assets", icon: "icon-store.png" },
      { title: "In-game motion & art", icon: "icon-ingame.png" },
    ],
  },
  {
    number: "02",
    title: "Playable Production",
    tagline: "From game assets to interactive ads.",
    copy: "HTML5 playables, adaptations and new variations. Built for testing, optimised for performance.",
    tone: "pink",
    services: [{ title: "Playable ads", icon: "icon-playable.png" }],
  },
  {
    number: "03",
    title: "Creative Development",
    tagline: "Good ideas deserve great execution.",
    copy: "Concepts, scripts, storyboards, direction and cinematics. We bring storytelling expertise to every stage.",
    tone: "ink",
    services: [{ title: "Trailers & cinematics", icon: "icon-trailers.png" }],
  },
];

const clients = [
  "Playtika",
  "Moon Active",
  "Voodoo",
  "Plarium",
  "Youda",
  "Slotomania",
  "Beach Bum Games",
];

const principles = [
  {
    number: "01",
    title: "See us in action",
    copy: "Watch our reel. Or start with a test task and judge our work on your own project.",
  },
  {
    number: "02",
    title: "Built around your needs",
    copy: "One project or ongoing production. We fit your pipeline and scale with you.",
  },
  {
    number: "03",
    title: "Clear terms",
    copy: "Transparent pricing, agreed scope and realistic deadlines. No surprises.",
  },
  {
    number: "04",
    title: "Your brief. Our craft.",
    copy: "Bring your brief and assets. We add the storytelling, creative thinking and production expertise. Need more? We can build from scratch.",
  },
  {
    number: "05",
    title: "Creativity that delivers",
    copy: "Strong ideas. Beautiful execution. Consistent quality, delivered on time.",
  },
];

const workingNotes = [
  {
    name: "Dedicated producer.",
    detail: "One contact, from brief to delivery.",
  },
  {
    name: "Your production portal.",
    detail: "Every project, status and deadline in one place.",
  },
  {
    name: "Your files, your control.",
    detail: "We work on your drive or hand over the project files.",
  },
];

const facts: { title: string; copy: ReactNode }[] = [
  {
    title: "Since 2006",
    copy: "Twenty years of animation from Kyiv, for clients across Europe and North America.",
  },
  {
    title: "Brands",
    copy: "500+ animated commercials, including campaigns for Nestlé, Samsung, McDonald's, Mastercard, Kraft, Coca-Cola, PepsiCo, P&G and others.",
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

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [showReel, setShowReel] = useState(false);
  const [formSent, setFormSent] = useState(false);
  const reelFrameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.body.classList.toggle("no-scroll", menuOpen || showReel);
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setShowReel(false);
      setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.classList.remove("no-scroll");
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen, showReel]);

  useEffect(() => {
    if (!showReel) return;
    const frame = reelFrameRef.current as
      | (HTMLDivElement & { webkitRequestFullscreen?: () => void })
      | null;
    const phone = window.matchMedia("(max-width: 680px)").matches;
    if (!phone || !frame) return;

    const enter =
      frame.requestFullscreen?.bind(frame) ??
      frame.webkitRequestFullscreen?.bind(frame);
    try {
      void Promise.resolve(enter?.()).catch(() => undefined);
    } catch {
      /* overlay still fills the phone */
    }

    const onChange = () => {
      const active =
        document.fullscreenElement ??
        (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement;
      if (!active) setShowReel(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
      if (document.fullscreenElement) void document.exitFullscreen();
    };
  }, [showReel]);

  useEffect(() => {
    const root = document.documentElement;
    const sections = Array.from(document.querySelectorAll("main > section:not(.hero)"));
    const items = Array.from(
      document.querySelectorAll(
        ".production-card, .principle-grid article, .facts-grid article",
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
    const hostedForms = host.endsWith(".netlify.app");
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

        <nav
          className={`main-nav ${menuOpen ? "is-open" : ""}`}
          aria-label="Main navigation"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeMenu();
          }}
        >
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
            <p className="eyebrow">Creative Playable Cinematics</p>
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
            <h2>
              What we <LogoWord>make</LogoWord>
            </h2>
            <p>
              Your creative production partner. From a single task to a steady
              flow.
            </p>
          </div>

          <div className="production-grid">
            {productionGroups.map((group) => (
              <article className={`production-card ${group.tone}`} key={group.number}>
                <span>{group.number}</span>
                <h3>{group.title}</h3>
                <p className="production-card-tagline">{group.tagline}</p>
                <p>{group.copy}</p>
                <ul
                  className={`production-services${group.services.length === 1 ? " is-single" : ""}`}
                >
                  {group.services.map((service) => (
                    <li key={service.title}>
                      <img
                        className="production-service-icon"
                        src={asset(service.icon)}
                        alt=""
                        aria-hidden="true"
                        width={160}
                        height={160}
                        draggable={false}
                        loading="lazy"
                      />
                      <span>{service.title}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>

          <aside className="ai-strip" aria-label="AI in our pipeline">
            <p className="ai-strip-title">
              <strong>AI</strong> in our pipeline
            </p>
            <p>
              We use AI where it makes the work better: faster concepts, more
              variants, cleaner production. Every frame is still directed and
              finished by our team. Have an AI policy? We'll work within it.
            </p>
          </aside>

          <p className="capability-row">
            2D · 3D · Motion design · Spine · Concept art · Storyboards · Key
            art · Static ads · UI animation · VFX
          </p>

          <p className="services-cta">
            <a className="primary-button" href="#contact">
              Start a project <ArrowIcon />
            </a>
          </p>
        </section>

        <aside className="clients-strip" aria-label="Trusted by teams at">
          <p className="clients-strip-label">Trusted by teams at</p>
          <div className="clients-marquee">
            <div className="clients-marquee-track">
              {[0, 1, 2].map((copy) => (
                <ul
                  className="clients-strip-names"
                  key={copy}
                  aria-hidden={copy > 0 ? true : undefined}
                >
                  {clients.map((name) => (
                    <li key={`${copy}-${name}`}>{name}</li>
                  ))}
                </ul>
              ))}
            </div>
          </div>
        </aside>

        <section className="thinking-section">
          <div className="thinking-heading">
            <h2>How we work</h2>
            <p className="thinking-lead">
              Studio-level creative. Production you can plan around.
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

          <ul className="thinking-list">
            {workingNotes.map((note) => (
              <li key={note.name}>
                <strong>{note.name}</strong> {note.detail}
              </li>
            ))}
          </ul>
        </section>

        <section className="about-section" id="about">
          <div className="about-heading">
            <h2>
              <span className="title-sells">
                Built <strong>on</strong>
              </span>{" "}
              LISENBART FILM
            </h2>
          </div>

          <div className="about-intro">
            <p className="about-lead">
              <strong className="brand-name">Lisenbart Games</strong> is part of{" "}
              <strong className="brand-name">Lisenbart Film</strong>, an independent
              animation studio founded in Kyiv in 2006. Everything we learned
              making commercials and award-winning films now goes into your
              trailers, ads and playables.
            </p>
            <p className="about-cred">
              20 years in animation. 1,000+ projects delivered.
            </p>
          </div>

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
              Founded by Dmytro Lisenbart, former head of Ukranimafilm, Ukraine's
              national animation studio.
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
            </div>
          </div>
        </section>

        <section className="contact-section" id="contact">
          <div className="contact-copy">
            <p className="eyebrow">Start a project</p>
            <h2>
              What's your next <LogoWord>project</LogoWord>?
            </h2>
            <p>
              Tell us about your game and what you need.
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
                  <option>Playable ads</option>
                  <option>Ad creatives</option>
                  <option>Ad variants & localisation</option>
                  <option>Trailer / cinematic</option>
                  <option>Store & ASO assets</option>
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
        <div
          className="reel-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Lisenbart Games showreel"
          onClick={() => setShowReel(false)}
        >
          <button type="button" onClick={() => setShowReel(false)} aria-label="Close showreel">
            Close <span>×</span>
          </button>
          <div
            className="video-frame"
            ref={reelFrameRef}
            onClick={(event) => event.stopPropagation()}
          >
            <iframe
              src="https://player.vimeo.com/video/944158555?autoplay=1&dnt=1&title=0&byline=0&portrait=0&playsinline=0"
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
