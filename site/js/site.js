(function () {
  var header = document.getElementById("top");
  var toggle = document.querySelector(".menu-toggle");
  var menu = document.getElementById("menu");
  var reel = document.querySelector(".reel");
  var play = document.querySelector(".reel-play");

  function setStuck() {
    if (!header) return;
    header.classList.toggle("is-stuck", window.scrollY > 8);
  }

  function closeMenu() {
    document.body.classList.remove("is-open");
    if (toggle) toggle.setAttribute("aria-expanded", "false");
  }

  setStuck();
  window.addEventListener("scroll", setStuck, { passive: true });

  if (toggle && menu) {
    toggle.addEventListener("click", function () {
      var open = document.body.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.textContent = open ? "Close" : "Menu";
    });

    menu.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        closeMenu();
        toggle.textContent = "Menu";
      });
    });
  }

  if (reel && play) {
    play.addEventListener("click", function () {
      var id = reel.getAttribute("data-vimeo");
      if (!id) return;
      var frame = document.createElement("iframe");
      frame.src =
        "https://player.vimeo.com/video/" +
        id +
        "?autoplay=1&dnt=1&title=0&byline=0&portrait=0";
      frame.title = "Lisenbart Games showreel";
      frame.allow = "autoplay; fullscreen; picture-in-picture";
      frame.setAttribute("allowfullscreen", "");
      reel.replaceChildren(frame);
    });
  }

  var form = document.querySelector(".brief");
  var ok = document.querySelector(".form-ok");
  var email = "dmytro@lisenbart.games";

  function hostedForms() {
    var host = window.location.hostname;
    return host === "lisenbart.games" || host.endsWith(".netlify.app");
  }

  if (form && ok) {
    form.addEventListener("submit", function (event) {
      if (form.querySelector("[name='bot-field']").value) {
        event.preventDefault();
        return;
      }
      if (hostedForms()) return;

      event.preventDefault();
      var data = new FormData(form);
      var body = [
        "Name: " + (data.get("name") || ""),
        "Email: " + (data.get("email") || ""),
        "Company: " + (data.get("company") || ""),
        "Need: " + (data.get("need") || ""),
        "",
        data.get("message") || "",
      ].join("\n");
      window.location.href =
        "mailto:" +
        email +
        "?subject=" +
        encodeURIComponent("Brief — Lisenbart Games") +
        "&body=" +
        encodeURIComponent(body);
      form.classList.add("is-sent");
      ok.hidden = false;
    });
  }

  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    var blocks = document.querySelectorAll("main > section:not(.hero)");
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            entry.target.classList.add("is-in");
            io.unobserve(entry.target);
          });
        },
        { threshold: 0.12 }
      );
      blocks.forEach(function (el) {
        el.classList.add("reveal");
        io.observe(el);
      });
    }
  }
})();
