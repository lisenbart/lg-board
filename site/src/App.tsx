import { useState } from "react";
import {
  EMAIL,
  MAILTO,
  VIMEO_ID,
  clients,
  frames,
  services,
} from "./content.ts";

const vimeoSrc = `https://player.vimeo.com/video/${VIMEO_ID}?dnt=1&title=0&byline=0&portrait=0`;

function GamingReel() {
  const [playing, setPlaying] = useState(false);

  return (
    <div className="reel">
      {playing ? (
        <iframe
          src={`${vimeoSrc}&autoplay=1`}
          title="Lisenbart Games Animation — gaming reel"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <button
          type="button"
          className="reel-play"
          onClick={() => setPlaying(true)}
          aria-label="Play gaming reel"
        >
          <img src="/images/work/01.webp" alt="" width={1280} height={720} />
          <span className="play-disc" aria-hidden="true">
            Play
          </span>
        </button>
      )}
    </div>
  );
}

export default function App() {
  return (
    <>
      <a className="skip" href="#work">
        Skip to work
      </a>

      <header className="top">
        <a className="brand" href="/">
          <img src="/logo.png" width={322} height={209} alt="Lisenbart Games Animation" />
        </a>
        <nav className="nav" aria-label="Page">
          <a href="#work">Work</a>
          <a href="#services">Services</a>
          <a href="#studio">Studio</a>
          <a className="cta" href={MAILTO}>
            Start a brief
          </a>
        </nav>
      </header>

      <main>
        <section className="wrap hero" aria-labelledby="hero-title">
          <p className="eyebrow">Kyiv · Warsaw</p>
          <h1 id="hero-title">Your game. Our next move.</h1>
          <p className="lede">
            Playable ads, game animation and video creatives for studios, publishers
            and UA teams. You bring the art and the brief. We assemble the piece
            that has to land.
          </p>
          <a className="hero-cta" href={MAILTO}>
            Start a brief
          </a>
        </section>

        <section id="work" className="wrap block">
          <div className="stage-label">
            <span>Gaming reel</span>
            <span>Shipped game work</span>
          </div>
          <GamingReel />
          <div className="frames">
            {frames.map((frame, index) => (
              <figure key={frame.src}>
                <img
                  src={frame.src}
                  alt={frame.alt}
                  width={1280}
                  height={720}
                  loading={index === 0 ? "eager" : "lazy"}
                />
              </figure>
            ))}
          </div>
          <dl className="clients">
            <dt>Selected clients</dt>
            <dd>
              {clients.map((name) => (
                <span key={name}>{name}</span>
              ))}
            </dd>
          </dl>
        </section>

        <section id="services" className="wrap block">
          <p className="kicker">Services</p>
          <h2>What we make</h2>
          <div className="services">
            {services.map((item) => (
              <article className="service" key={item.n}>
                <h3>{item.name}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="studio" className="wrap block">
          <div className="studio">
            <div>
              <p className="kicker">The studio</p>
              <h2>Kyiv and Warsaw. A production motion team for games.</h2>
            </div>
            <div>
              <p>
                We are not a platform and not a dashboard. We take the artwork you
                already have, read the brief, and put a finished piece on the
                timeline.
              </p>
              <p>
                Full cycle when the project needs it — boards, animation, finish.
                A single cut when it does not. Creative direction stays in the
                room, including AI and mixed media, when they serve the frame.
              </p>
            </div>
          </div>
        </section>

        <section id="contact" className="wrap block contact">
          <p className="kicker">Contact</p>
          <h2>What are you working on?</h2>
          <a className="mail" href={MAILTO}>
            {EMAIL}
          </a>
          <p className="hint">A title, a format, a date. That is enough to start.</p>
        </section>
      </main>

      <footer className="foot">
        <span>Lisenbart Games Animation</span>
        <div className="foot-links">
          <a href="https://board.lisenbart.games/?door=studio" rel="noreferrer">
            Studio
          </a>
          <a href="https://board.lisenbart.games/hours" rel="noreferrer">
            Hours
          </a>
        </div>
      </footer>
    </>
  );
}
