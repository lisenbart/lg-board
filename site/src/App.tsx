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
const stills = frames.slice(1);

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
          <img
            src="/logo.png"
            width={322}
            height={209}
            alt="Lisenbart Games Animation"
          />
        </a>
        <a className="cta" href={MAILTO}>
          Brief
        </a>
      </header>

      <main>
        <section id="work" className="work">
          <div className="film">
            <GamingReel />
            <div className="stills">
              {stills.map((frame) => (
                <img
                  key={frame.src}
                  src={frame.src}
                  alt={frame.alt}
                  width={1280}
                  height={720}
                  loading="lazy"
                />
              ))}
            </div>
          </div>

          <div className="caption">
            <div className="copy">
              <p className="place">Kyiv · Warsaw</p>
              <h1>Your game. Our next move.</h1>
              <p className="lede">
                You send the artwork and a short brief. We assemble playable
                ads, game animation and UA / ASO cuts — the piece that has to
                land.
              </p>
            </div>
            <p className="clients">
              {clients.map((name) => (
                <span key={name}>{name}</span>
              ))}
            </p>
          </div>
        </section>

        <section id="offer" className="offer" aria-label="What we assemble">
          {services.map((item) => (
            <article key={item.n}>
              <h2>{item.name}</h2>
              <p>{item.text}</p>
            </article>
          ))}
        </section>

        <section id="contact" className="close">
          <p>
            Full cycle when the project needs it. A single cut when it does
            not.
          </p>
          <a className="mail" href={MAILTO}>
            {EMAIL}
          </a>
          <p className="hint">A title, a format, a date.</p>
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
