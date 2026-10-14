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
})();
