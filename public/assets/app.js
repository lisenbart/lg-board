const STATUS = {
  new: { label: "Ready to Start", cls: "status-new", order: 1 },
  wip: { label: "WIP", cls: "status-wip", order: 2 },
  revision: { label: "Need Fixing", cls: "status-revision", order: 3 },
  tlcheck: { label: "TL Check", cls: "status-tlcheck", order: 4 },
  done: { label: "Done", cls: "status-done", order: 5 },
  approve: { label: "Senior Approval", cls: "status-approve", order: 6 },
  closed: { label: "Closed", cls: "status-closed", order: 7 },
  storyboard: { label: "Storyboard", cls: "status-wip", order: 2 },
  clientart: { label: "Client art", cls: "status-approve", order: 3 },
  finalart: { label: "Final art", cls: "status-revision", order: 4 },
  build: { label: "Build", cls: "status-tlcheck", order: 5 },
  htmlready: { label: "HTML ready", cls: "status-done", order: 6 },
};

const ROLE_LABEL = {
  finance: "Finance",
  manager: "Line Producer",
  teamlead: "Team Lead",
  designer: "Motion design",
  art_director: "Art Director",
  programmer: "Programmer",
  client: "Client",
};
const JOB_BADGE = {
  finance: { code: "FN", title: "Finance" },
  manager: { code: "LP", title: "Line Producer" },
  teamlead: { code: "TL", title: "Team Lead" },
  designer: { code: "MD", title: "Motion design" },
  art_director: { code: "AD", title: "Art Director" },
  programmer: { code: "DEV", title: "Programmer" },
  client: { code: "SP", title: "Client" },
};
const TEAM_JOBS = [
  { id: "designer", label: "Motion design" },
  { id: "art_director", label: "Art Director" },
  { id: "programmer", label: "Programmer" },
  { id: "teamlead", label: "Team Lead" },
  { id: "manager", label: "Line Producer" },
  { id: "finance", label: "Finance" },
];

const NAME_WIDTH_KEY = "lg-name-width";
const NAME_WIDTH_DEFAULT = 412;
const NAME_WIDTH_MIN = 240;

const STATUS_BY_ROLE = {
  designer: ["wip", "tlcheck"],
  teamlead: ["wip", "tlcheck", "done"],
  manager: ["revision", "closed"],
  finance: ["revision", "closed"],
  art_director: ["new", "storyboard", "finalart", "build"],
  programmer: ["build", "htmlready"],
  client: [],
};
const PLAY_STATUS_BY_ROLE = {
  art_director: ["new", "storyboard", "finalart", "build"],
  programmer: ["build", "htmlready"],
  designer: ["storyboard", "finalart"],
  teamlead: ["storyboard", "finalart", "build"],
  manager: ["storyboard", "clientart", "closed"],
  finance: ["storyboard", "clientart", "closed"],
  client: [],
};
const LINES = ["DD", "DX", "DS"];
const STUDIO_ROLES = [
  { role: "finance", label: "DL", blurb: "" },
  { role: "manager", label: "LP", blurb: "Line Producer" },
  { role: "teamlead", label: "TL", blurb: "Team Lead" },
  { role: "designer", label: "MD", blurb: "Motion design" },
  { role: "art_director", label: "AD", blurb: "Art Director" },
  { role: "programmer", label: "DEV", blurb: "Programmer" },
];
const DIR_KEY = "lg-direction";
const DIR_LABEL = { mgx: "SUPERPLAY MGX", playables: "SUPERPLAY Playables" };

const MONTH_KEY = "lg-month";
const SESSION_KEY = "lg-session";

const ACCOUNTS = [
  {
    email: "dmytro@lisenbart.games",
    name: "Dmytro Lisenbart",
    blurb: "Studio",
    lockRole: "finance",
  },
  {
    email: "anastasiia@lisenbart.games",
    name: "Anastasiia",
    blurb: "Line Producer",
    lockRole: "manager",
  },
  {
    email: "lisenbart.games@gmail.com",
    name: "Designers · Drive",
    blurb: "Team Lead / Motion design",
    lockRole: null,
  },
  {
    email: "superplay@lg-board",
    name: "SuperPlay",
    blurb: "Hours report",
    lockRole: "client",
  },
];

const state = {
  db: null,
  roleId: "",
  view: "board",
  selected: new Set(),
  openId: null,
  designerFilter: null,
  month: "2026-10",
  teamDrafts: {},
  session: null,
  finTab: "client",
  nbu: null,
  invoiceFolder: null,
  excelMonth: null,
  finApi: null,
  finApiMonth: null,
  finApiLoading: null,
  drive: null,
  driveLoading: false,
  driveTried: {},
  driveAccessToken: sessionStorage.getItem("lgDriveToken") || "",
  search: "",
  searchFocus: false,
  searchCaret: 0,
  direction: localStorage.getItem("lg-direction") || "mgx",
};
const $ = (id) => document.getElementById(id);

function isLocalHost() {
  return location.hostname === "localhost" || location.hostname === "127.0.0.1";
}
function isHoursPage() {
  return (
    document.documentElement.classList.contains("hours-host") ||
    /^\/hours\/?$/.test(location.pathname)
  );
}
function clientLink() {
  return `${location.origin}/hours`;
}
function studioAccounts() {
  return ACCOUNTS.filter((a) => a.lockRole !== "client");
}
function isStudioHost() {
  return (
    isLocalHost() ||
    document.documentElement.classList.contains("studio-host") ||
    window.__lgStudioApi === true
  );
}
function probeStudioApi() {
  return fetch("/health", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      if (j && j.ok) {
        document.documentElement.classList.add("studio-host");
        window.__lgStudioApi = true;
      }
    })
    .catch(() => {});
}
function readSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function writeSession(session) {
  state.session = session;
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
}
function accountByEmail(email) {
  return ACCOUNTS.find((a) => a.email === email);
}
function seatPeople(account) {
  const people = state.db?.people || [];
  if (!account) return [];
  if (account.lockRole) return people.filter((p) => p.role === account.lockRole);
  return people.filter((p) => p.role === "teamlead" || p.role === "designer");
}
function applySession(session) {
  const seatId = session?.seatId || session?.personId;
  const people = state.db?.people || [];
  const seat = people.find((p) => p.id === seatId);
  if (!seat) {
    writeSession(null);
    return false;
  }
  if (session?.role && seat.role !== session.role) {
    writeSession(null);
    return false;
  }
  state.roleId = seat.id;
  state.session = {
    email: session.email || seat.email || "",
    seatId: seat.id,
    role: seat.role,
  };
  writeSession(state.session);
  return true;
}
function enterStudio() {
  document.documentElement.classList.add("in-app");
  $("loginGate").hidden = true;
  document.title = isHoursPage() ? "Hours — Lisenbart Board" : "Lisenbart Board";
  startLiveSync();
}
function openLoginGate() {
  document.documentElement.classList.remove("in-app");
  $("loginGate").hidden = false;
  stopLiveSync();
}
function showHome() {
  state.loginDoor = null;
  state.loginPin = "";
  openLoginGate();
  $("loginTitle").hidden = true;
  $("loginLead").hidden = true;
  $("loginLead").textContent = "";
  document.title = "Lisenbart Board";
  $("loginCard")?.classList.add("is-home");
  $("loginAccounts").innerHTML = `
    <img class="home-logo" src="assets/logo.png" alt="Lisenbart Games Animation" />
    <div class="home-doors">
      <button type="button" class="home-door" id="doorClient">
        <strong>Client</strong>
      </button>
      <button type="button" class="home-door is-studio" id="doorStudio">
        <strong>Studio</strong>
      </button>
    </div>
  `;
  $("doorClient")?.addEventListener("click", () => showDoorForm("client"));
  $("doorStudio")?.addEventListener("click", () => showStudioRoster());
}
function loginBackHome() {
  if (isHoursPage()) {
    location.href = "/";
    return;
  }
  showHome();
}
function paintStudioSeats(roles, error) {
  const list = roles && roles.length ? roles : STUDIO_ROLES;
  $("loginAccounts").innerHTML =
    `<button type="button" class="btn ghost login-back" id="loginBack">Back</button>` +
    (error ? `<p class="login-err">${escapeHtml(error)}</p>` : "") +
    list
      .map(
        (r) =>
          `<button type="button" class="login-seat" data-role="${escapeHtml(r.role)}">
            <strong>${escapeHtml(r.label)}</strong>
            ${r.blurb ? `<span>${escapeHtml(r.blurb)}</span>` : ""}
          </button>`
      )
      .join("");
  $("loginBack")?.addEventListener("click", loginBackHome);
  $("loginAccounts").querySelectorAll(".login-seat").forEach((el) => {
    el.addEventListener("click", () => {
      const role = list.find((r) => r.role === el.dataset.role);
      if (role) showStudioPin(role);
    });
  });
}
function showStudioRoster(error) {
  state.loginDoor = "studio";
  state.loginRole = null;
  openLoginGate();
  $("loginCard")?.classList.remove("is-home");
  $("loginTitle").hidden = false;
  $("loginLead").hidden = false;
  $("loginTitle").textContent = "Studio";
  $("loginLead").textContent = "Pick a login";
  document.title = "Studio — Lisenbart Board";
  paintStudioSeats(STUDIO_ROLES, error);
}
function showStudioPin(role, error) {
  state.loginDoor = "studio";
  state.loginRole = role;
  openLoginGate();
  $("loginCard")?.classList.remove("is-home");
  $("loginTitle").hidden = false;
  $("loginLead").hidden = false;
  $("loginTitle").textContent = role.label || "Studio";
  $("loginLead").hidden = !role.blurb;
  $("loginLead").textContent = role.blurb || "";
  $("loginAccounts").innerHTML = `
    <button type="button" class="btn ghost login-back" id="loginBack">Back</button>
    <label class="login-pin-lab" for="loginPin">PIN</label>
    <input id="loginPin" class="login-pin" type="password" inputmode="numeric" maxlength="8" autocomplete="current-password" />
    ${error ? `<p class="login-err">${escapeHtml(error)}</p>` : ""}
    <button type="button" class="btn primary login-go" id="loginGo">Open</button>
  `;
  $("loginBack")?.addEventListener("click", () => showStudioRoster());
  const go = () => submitDoorLogin();
  $("loginGo")?.addEventListener("click", go);
  $("loginPin")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      go();
    }
  });
  $("loginPin")?.focus();
}
function showSeatPicker(seats) {
  openLoginGate();
  $("loginTitle").hidden = false;
  $("loginLead").hidden = false;
  const roles = [...new Set(seats.map((p) => p.role).filter(Boolean))];
  const mixed = roles.length > 1;
  if (!mixed && roles[0] === "designer") {
    $("loginTitle").textContent = "MD";
    $("loginLead").textContent = "Who is at the desk?";
  } else {
    $("loginTitle").textContent = "Who is at the desk?";
    const bits = [];
    if (roles.includes("finance")) bits.push("DL");
    if (roles.includes("manager")) bits.push("LP");
    if (roles.includes("teamlead")) bits.push("TL");
    if (roles.includes("designer")) bits.push("a designer");
    if (roles.includes("art_director")) bits.push("an art director");
    if (roles.includes("programmer")) bits.push("a programmer");
    $("loginLead").textContent =
      bits.length > 1 ? `Pick ${bits.slice(0, -1).join(", ")} or ${bits[bits.length - 1]}` : "Pick a seat";
  }
  $("loginAccounts").innerHTML =
    `<button type="button" class="btn ghost login-back" id="loginBack">Back</button>` +
    seats
      .map((p) => {
        const badge = JOB_BADGE[p.role] || { code: p.label || "", title: ROLE_LABEL[p.role] || "" };
        const sub = badge.code && badge.title ? `${badge.code} · ${badge.title}` : badge.title || "Motion design";
        return `<button type="button" class="login-seat" data-seat="${escapeHtml(p.id)}">
            <strong>${escapeHtml(p.name)}</strong>
            <span>${escapeHtml(sub)}</span>
          </button>`;
      })
      .join("");
  $("loginBack")?.addEventListener("click", () => showStudioPin(state.loginRole));
  $("loginAccounts").querySelectorAll(".login-seat").forEach((el) => {
    el.addEventListener("click", () => submitDoorLogin(el.dataset.seat));
  });
}
function showDoorForm(door, error) {
  state.loginDoor = door;
  if (door === "studio") {
    showStudioRoster(error);
    return;
  }
  openLoginGate();
  $("loginCard")?.classList.remove("is-home");
  $("loginTitle").hidden = false;
  $("loginLead").hidden = false;
  $("loginTitle").textContent = "Client";
  $("loginLead").textContent = "Hours for your projects.";
  document.title = isHoursPage() ? "Hours — Lisenbart Board" : "Client — Lisenbart Board";
  $("loginAccounts").innerHTML = `
    <button type="button" class="btn ghost login-back" id="loginBack">Back</button>
    <label class="login-pin-lab" for="loginEmail">Login</label>
    <input id="loginEmail" class="login-pin login-email" type="text" autocomplete="username" />
    <label class="login-pin-lab" for="loginPin">Password</label>
    <input id="loginPin" class="login-pin" type="password" maxlength="32" autocomplete="current-password" />
    ${error ? `<p class="login-err">${escapeHtml(error)}</p>` : ""}
    <button type="button" class="btn primary login-go" id="loginGo">Open</button>
  `;
  $("loginBack")?.addEventListener("click", loginBackHome);
  const go = () => submitDoorLogin();
  $("loginGo")?.addEventListener("click", go);
  ["loginEmail", "loginPin"].forEach((id) => {
    $(id)?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        go();
      }
    });
  });
  $("loginEmail")?.focus();
}
async function submitDoorLogin(seatId) {
  const door = state.loginDoor || (isHoursPage() ? "client" : "studio");
  const pin = $("loginPin") ? $("loginPin").value : state.loginPin || "";
  if (pin) state.loginPin = pin;
  const email = $("loginEmail") ? $("loginEmail").value : state.loginEmail || "";
  if (email) state.loginEmail = email;
  const role = state.loginRole?.role;
  const out = await api("/api/login", {
    door,
    email: state.loginEmail,
    pin: state.loginPin,
    role,
    seatId: seatId || undefined,
  });
  if (out.error) {
    if (door === "studio" && state.loginRole) {
      showStudioPin(state.loginRole, out.error);
      return;
    }
    showDoorForm(door, out.error);
    return;
  }
  if (out.needSeat) {
    showSeatPicker(out.seats || []);
    return;
  }
  const sess = out.session || {};
  applyState(out.state, { render: false });
  if (!applySession(sess)) {
    if (door === "studio" && state.loginRole) {
      showStudioPin(state.loginRole, "Could not open this seat");
      return;
    }
    showDoorForm(door, "Could not open this seat");
    return;
  }
  if ((sess.role === "client" || door === "client") && !isHoursPage()) {
    location.replace("/hours");
    return;
  }
  enterStudio();
  render();
}
function showLogin() {
  if (isHoursPage()) {
    showDoorForm("client");
    return;
  }
  const door = new URLSearchParams(location.search).get("door");
  if (door === "studio") {
    showStudioRoster();
    return;
  }
  if (door === "client") {
    showDoorForm("client");
    return;
  }
  showHome();
}
function showNeedServer() {
  openLoginGate();
  $("loginTitle").hidden = false;
  $("loginTitle").textContent = "Studio desk";
  $("loginLead").hidden = false;
  $("loginLead").textContent = "This board runs on the studio server. Open https://board.lisenbart.games";
  $("loginCard")?.classList.remove("is-home");
  $("loginAccounts").innerHTML = "";
}
function whoLabel(p) {
  if (p?.role === "finance") return p.name || "Dmytro Lisenbart";
  if (p?.role === "client") return p.name || "SuperPlay";
  return `${p.name} · ${jobMeta(p).code} ${jobMeta(p).title}`;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function copyText(text) {
  const value = String(text || "");
  try {
    if (navigator.clipboard?.writeText) {
      await Promise.race([
        navigator.clipboard.writeText(value),
        new Promise((_, reject) => setTimeout(() => reject(new Error("clipboard timeout")), 1200)),
      ]);
      return true;
    }
  } catch {
    /* fall through to execCommand */
  }
  try {
    const area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

function showPaste(title, intro, text) {
  $("pasteTitle").textContent = title;
  $("pasteIntro").textContent = intro;
  $("pasteText").value = text;
  $("pasteModal").classList.add("show");
}

function mondayReply(task) {
  const link = String(task?.resultUrl || "").trim();
  return link ? `check it please\n${link}` : "check it please";
}

function person(id) {
  return (state.db.people || []).find((p) => p.id === id);
}
function me() {
  const mine = person(state.roleId);
  if (mine) return mine;
  return { id: state.roleId || "", role: "", name: "" };
}
function isFinance() {
  if (isHoursPage()) return false;
  return me().role === "finance";
}
function isClient() {
  return me()?.role === "client" || isHoursPage();
}
function isDesigner() {
  return me().role === "designer";
}
function isArtDirector() {
  return me().role === "art_director";
}
function isProgrammer() {
  return me().role === "programmer";
}
function isPerformer() {
  return isDesigner() || isArtDirector() || isProgrammer();
}
function isTeamLead() {
  return me().role === "teamlead";
}
function canOps() {
  return me().role === "manager" || me().role === "finance";
}
function directionOf(t) {
  const raw = String(t?.department || t?.direction || "MGX").toLowerCase();
  return raw.startsWith("play") ? "playables" : "mgx";
}
function isPlayables(t) {
  return directionOf(t) === "playables";
}
function personDirections(p) {
  const raw = p?.directions;
  if (Array.isArray(raw) && raw.length) return raw.map((d) => String(d).toLowerCase());
  if (p?.role === "art_director" || p?.role === "programmer") return ["playables"];
  if (p?.role === "finance" || p?.role === "manager" || p?.role === "client") return ["mgx", "playables"];
  return ["mgx"];
}
function canSeeDirection(dir) {
  const p = me();
  if (!p) return dir === "mgx";
  if (p.role === "finance" || p.role === "client") return true;
  return personDirections(p).includes(dir);
}
function setDirection(dir) {
  const next = dir === "playables" ? "playables" : "mgx";
  if (!canSeeDirection(next)) return;
  state.direction = next;
  localStorage.setItem(DIR_KEY, next);
  state.selected.clear();
  state.designerFilter = null;
  render();
}
function syncDirection() {
  const p = me();
  const dirs = personDirections(p);
  if (p?.role === "finance" || p?.role === "client") return;
  if (!dirs.includes(state.direction)) {
    state.direction = dirs.includes("playables") && !dirs.includes("mgx") ? "playables" : dirs[0] || "mgx";
    localStorage.setItem(DIR_KEY, state.direction);
  }
}
function isDeletableTask(t) {
  return Boolean(t && t.id);
}
function isClientCopyable(t) {
  return Boolean(t && t.studioStatus !== "closed" && String(t.resultUrl || "").trim());
}
function canWriteNotes() {
  return canOps() || isTeamLead();
}
function clientComments(t) {
  return Array.isArray(t?.comments) ? t.comments : [];
}
function canEditTime() {
  return canOps();
}
function shiftHours() {
  return Number(state.db?.meta?.shiftHours) || 9;
}
function hoursFromShifts(shifts) {
  return Math.round(Number(shifts) * shiftHours() * 10) / 10;
}
function parseShifts(raw) {
  const n = Number(String(raw ?? "").trim().replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 1000) / 1000;
}
function hoursOf(t) {
  return Number(t.hours) || hoursFromShifts(t.shifts || 0) || 0;
}
function roundHours(n) {
  const x = Number(n);
  if (!Number.isFinite(x) || x <= 0) return 0;
  return Math.round(x * 10) / 10;
}
function helpEntries(t) {
  const who = String(t?.assigneeId || "");
  const seen = new Set();
  const rows = [];
  for (const row of t?.help || []) {
    const id = String(row?.id || "").trim();
    const hours = roundHours(row?.hours);
    if (!id || id === who || hours <= 0 || seen.has(id)) continue;
    seen.add(id);
    rows.push({ id, hours });
  }
  return rows;
}
function helpHoursTotal(t) {
  return roundHours(helpEntries(t).reduce((s, row) => s + row.hours, 0));
}
function hoursOwned(t) {
  if (isPlayables(t)) {
    const ah = roundHours(t?.assigneeHours);
    if (ah) return ah;
    const rest = hoursOf(t) - helpHoursTotal(t) - roundHours(t?.programmerHours) - roundHours(t?.motionHours);
    return Math.max(0, roundHours(rest));
  }
  return Math.max(0, Math.round((hoursOf(t) - helpHoursTotal(t)) * 10) / 10);
}
function hoursForPerson(t, personId) {
  const id = String(personId || "");
  if (!id) return 0;
  if (isPlayables(t)) {
    const p = person(id);
    if (p?.role === "manager") {
      const ph = roundHours(t?.producerHours);
      if (ph) return ph;
      return roundHours(
        roundHours(t?.assigneeHours) +
          helpHoursTotal(t) +
          roundHours(t?.programmerHours) +
          roundHours(t?.motionHours)
      );
    }
    if (id === String(t?.programmerId || "")) return roundHours(t?.programmerHours);
    if (id === String(t?.motionId || "")) return roundHours(t?.motionHours);
    if (id === String(t?.assigneeId || "")) return hoursOwned(t);
    return helpEntries(t).find((row) => row.id === id)?.hours || 0;
  }
  if (id === String(t?.assigneeId || "")) return hoursOwned(t);
  return helpEntries(t).find((row) => row.id === id)?.hours || 0;
}
function helpedOn(t, personId) {
  return helpEntries(t).some((row) => row.id === personId);
}
function canEditHelp() {
  return canAssign() || canOps();
}
function usd(n) {
  return `$${(Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function uah(n) {
  return `${(Number(n) || 0).toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₴`;
}
function nbuRate() {
  const manual = Number(state.db?.meta?.nbuRate);
  if (Number.isFinite(manual) && manual > 0) return manual;
  const live = Number(state.nbu?.rate);
  if (Number.isFinite(live) && live > 0) return live;
  return 41.2;
}
function taxPct() {
  const n = Number(state.db?.meta?.taxPct);
  return Number.isFinite(n) && n >= 0 ? n : 0.06;
}
function taxPercent(tax) {
  const n = Number(tax);
  if (!Number.isFinite(n) || n < 0) return 6;
  return Math.round(n * 10000) / 100;
}
function formatCard(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}
function normalizeCard(raw) {
  return String(raw || "").replace(/\D/g, "");
}
function normalizeIban(raw) {
  return String(raw || "").replace(/\s+/g, "").toUpperCase();
}
function hoursLabel(n) {
  return `${(Number(n) || 0).toFixed(1)} h`;
}
function clientRate() {
  const n = Number(state.db?.meta?.clientRateUsd);
  return Number.isFinite(n) && n >= 0 ? n : 35;
}
function rolePayRate(p) {
  if (p?.role === "manager") {
    const n = Number(state.db?.meta?.managerRateUsd);
    return Number.isFinite(n) && n >= 0 ? n : 5;
  }
  const n = Number(state.db?.meta?.designerRateUsd);
  return Number.isFinite(n) && n >= 0 ? n : 15;
}
function personPayRate(p) {
  if (p && p.rateUsd !== undefined && p.rateUsd !== null && p.rateUsd !== "") {
    const n = Number(p.rateUsd);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return rolePayRate(p);
}
function parseRate(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const n = Number(s.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return false;
  return n;
}
function financeSnapshot() {
  const tasks = monthTasks({ all: true });
  const fx = nbuRate();
  const tax = taxPct();
  const rate = clientRate();
  const playRate = Number(state.db?.meta?.playableClientRateUsd) || 40;
  const totalHours = tasks.reduce((s, t) => s + hoursOf(t), 0);
  const totalShifts = tasks.reduce((s, t) => s + (Number(t.shifts) || 0), 0);
  const byLineMap = {};
  for (const t of tasks) {
    const dir = directionOf(t);
    const line = LINES.includes(t.line) ? t.line : t.line || "—";
    const key = `${dir}:${line}`;
    if (!byLineMap[key]) {
      byLineMap[key] = {
        direction: dir,
        label: `${dir === "playables" ? "Playable" : "MGX"} ${line}`,
        line,
        projects: 0,
        shifts: 0,
        hours: 0,
        bill: 0,
        rate: dir === "playables" ? playRate : rate,
      };
    }
    const h = hoursOf(t);
    const rowRate = dir === "playables" ? playRate : rate;
    byLineMap[key].projects += 1;
    byLineMap[key].shifts += Number(t.shifts) || 0;
    byLineMap[key].hours += h;
    byLineMap[key].bill += h * rowRate;
  }
  const byLine = Object.values(byLineMap);
  const payMap = {};
  for (const p of crew()) {
    payMap[p.id] = { person: p, projects: 0, shifts: 0, hours: 0, tasks: [] };
  }
  let unassignedHours = 0;
  let unassignedShifts = 0;
  let unassignedProjects = 0;
  for (const t of tasks) {
    const h = hoursOf(t);
    let allocated = 0;
    for (const p of crew()) {
      if (p.role === "manager" || !payMap[p.id]) continue;
      const share = hoursForPerson(t, p.id);
      if (share <= 0) continue;
      payMap[p.id].projects += 1;
      payMap[p.id].shifts += share / shiftHours();
      payMap[p.id].hours += share;
      payMap[p.id].tasks.push(t);
      allocated += share;
    }
    const leftover = Math.max(0, roundHours(h - allocated));
    if (leftover > 0.05) {
      unassignedHours += leftover;
      unassignedShifts += leftover / shiftHours();
      unassignedProjects += 1;
    }
  }
  const payroll = Object.values(payMap)
    .map((row) => {
      const payRate = personPayRate(row.person);
      const allHours = row.person.role === "manager";
      const hours = allHours ? totalHours : row.hours;
      const payUsd = hours * payRate;
      return {
        ...row,
        hours,
        shifts: allHours ? totalShifts : row.shifts,
        projects: allHours ? tasks.length : row.projects,
        allHours,
        rate: payRate,
        payUsd,
        payUah: payUsd * fx,
      };
    })
    .sort(
      (a, b) =>
        (a.person.payOrder || 99) - (b.person.payOrder || 99) ||
        String(a.person.name).localeCompare(String(b.person.name))
    );
  const clientIn = byLine.reduce((s, row) => s + row.bill, 0);
  const afterTax = clientIn - clientIn * tax;
  const empl = payroll.reduce((s, r) => s + r.payUsd, 0);
  const studio = afterTax - empl;
  return {
    month: monthLabel(state.month),
    ym: state.month,
    board: state.db?.meta?.board || "SUPERPLAY MGX",
    client: state.db?.meta?.client || "SuperPlay Ltd",
    tasks,
    totalHours,
    totalShifts,
    byLine,
    payroll,
    unassignedHours,
    unassignedShifts,
    unassignedProjects,
    clientIn,
    afterTax,
    empl,
    studio,
    clientInUah: clientIn * fx,
    afterTaxUah: afterTax * fx,
    emplUah: empl * fx,
    studioUah: studio * fx,
    fx,
    tax,
    clientRate: rate,
    playableClientRate: playRate,
    nbu: state.nbu || { rate: fx, source: state.db?.meta?.nbuRate ? "manual" : "fallback" },
  };
}
function canAssign() {
  return me().role === "teamlead" || me().role === "manager" || me().role === "finance";
}
function isExecView() {
  return isDesigner() || isTeamLead() || isArtDirector() || isProgrammer();
}
function isSendable(t) {
  if (!t) return false;
  if (isPlayables(t)) {
    if (t.studioStatus === "storyboard") return true;
    return t.studioStatus === "htmlready" && Boolean(String(t.resultUrl || "").trim());
  }
  return t.studioStatus === "done" && Boolean(String(t.resultUrl || "").trim());
}
function canPasteResult(t) {
  if (canOps()) return true;
  if (!t) return false;
  if (isPlayables(t)) {
    return onMyPlayable(t) && (isArtDirector() || isProgrammer() || isDesigner() || isTeamLead());
  }
  return t.assigneeId === me().id && (isDesigner() || isTeamLead());
}
function sortPeople(list) {
  return list.slice().sort(
    (a, b) =>
      (Number(a.payOrder) || 99) - (Number(b.payOrder) || 99) ||
      String(a.name).localeCompare(String(b.name))
  );
}
function designers() {
  return sortPeople((state.db.people || []).filter((p) => p.role === "teamlead" || p.role === "designer"));
}
function playableCrew() {
  return sortPeople(
    (state.db.people || []).filter(
      (p) =>
        (p.role === "art_director" || p.role === "programmer" || p.role === "designer") &&
        personDirections(p).includes("playables")
    )
  );
}
function boardPeople() {
  return state.direction === "playables" ? playableCrew() : designers();
}
function excelPeople() {
  if (state.direction !== "playables") return designers();
  const lp = (state.db.people || []).find((p) => p.role === "manager");
  const crew = playableCrew().filter((p) => p.role !== "designer" && p.id !== lp?.id);
  return lp ? [lp, ...crew] : crew;
}
function excelSeatLabel(p, used) {
  if (p.role === "manager") return "Producer";
  if (p.role === "programmer") {
    used.dev = (used.dev || 0) + 1;
    return `PRGMM${used.dev}`;
  }
  if (p.role === "designer") return "MOTION";
  used.art = (used.art || 0) + 1;
  return `2DART ${used.art}`;
}
function artDirectors() {
  return sortPeople(
    (state.db.people || []).filter((p) => p.role === "art_director" && personDirections(p).includes("playables"))
  );
}
function programmers() {
  return sortPeople(
    (state.db.people || []).filter((p) => p.role === "programmer" && personDirections(p).includes("playables"))
  );
}
function crew() {
  return (state.db.people || []).filter(
    (p) =>
      p.role === "manager" ||
      p.role === "teamlead" ||
      p.role === "designer" ||
      p.role === "art_director" ||
      p.role === "programmer"
  );
}

function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 3200);
}

function setBusy(el, on, label) {
  if (!el) return;
  if (on) {
    if (el.dataset.idleLabel == null) el.dataset.idleLabel = el.textContent;
    el.disabled = true;
    el.classList.add("is-busy");
    el.setAttribute("aria-busy", "true");
    if (label) el.textContent = label;
  } else {
    el.disabled = false;
    el.classList.remove("is-busy");
    el.removeAttribute("aria-busy");
    if (el.dataset.idleLabel != null) {
      el.textContent = el.dataset.idleLabel;
      delete el.dataset.idleLabel;
    }
  }
}

async function api(path, payload) {
  const ctrl = new AbortController();
  const ms = payload ? 12000 : 8000;
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(path, {
      method: payload ? "POST" : "GET",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: payload ? JSON.stringify(payload) : undefined,
      signal: ctrl.signal,
    });
    const type = res.headers.get("content-type") || "";
    if (!type.includes("json")) return { error: "desk did not answer" };
    const body = await res.json();
    if (res.status === 401 && path !== "/api/me" && path !== "/api/login") {
      writeSession(null);
      showLogin();
    }
    return body;
  } catch (err) {
    if (err && err.name === "AbortError") return { error: "desk timed out" };
    return { error: "desk did not answer" };
  } finally {
    clearTimeout(timer);
  }
}

function calendarMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function shiftMonth(ym, delta) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(ym) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
}
function driveMonthFolder(ym) {
  const [y, m] = ym.split("-").map(Number);
  const name = new Date(y, m - 1, 1).toLocaleString("en-US", { month: "long" });
  return `${String(m).padStart(2, "0")}_${name}`;
}
function liveMonthDriveUrl() {
  const meta = state.db?.meta || {};
  return meta.driveLiveOctober || meta.driveLiveDD || "";
}
function taskMonth(t) {
  return t.month || (t.deadline && String(t.deadline).slice(0, 7)) || state.db?.meta?.month || state.month;
}
function monthTasks(opts) {
  const all = (state.db.tasks || []).filter((t) => taskMonth(t) === state.month);
  if (opts?.all) return all;
  return all.filter((t) => directionOf(t) === state.direction);
}
function searchQuery() {
  return String(state.search || "").trim().toLowerCase();
}
function bindSearch() {
  const box = $("toolbar")?.querySelector(".search");
  if (!box) return;
  box.value = state.search || "";
  box.addEventListener("input", () => {
    state.search = box.value;
    state.searchFocus = true;
    state.searchCaret = box.selectionStart;
    render();
  });
  if (state.searchFocus) {
    const pos = typeof state.searchCaret === "number" ? state.searchCaret : box.value.length;
    box.focus();
    try {
      box.setSelectionRange(pos, pos);
    } catch {
      /* ignore */
    }
    state.searchFocus = false;
  }
}
function onMyPlayable(t) {
  const id = me().id;
  return (
    t.assigneeId === id ||
    t.programmerId === id ||
    t.motionId === id ||
    helpedOn(t, id)
  );
}
function visibleTasks() {
  const q = searchQuery();
  return monthTasks().filter((t) => {
    if (q && !`${t.name} ${t.brief}`.toLowerCase().includes(q)) return false;
    if (isDesigner() && t.assigneeId !== me().id && t.motionId !== me().id && !helpedOn(t, me().id)) return false;
    if ((isArtDirector() || isProgrammer()) && !onMyPlayable(t)) return false;
    if (!isPerformer() && state.designerFilter) {
      if (state.designerFilter === "done") {
        const want = state.direction === "playables" ? "htmlready" : "done";
        if (t.studioStatus !== want) return false;
      } else if (state.designerFilter === "unassigned") {
        if (t.assigneeId) return false;
      } else if (
        t.assigneeId !== state.designerFilter &&
        t.programmerId !== state.designerFilter &&
        !helpedOn(t, state.designerFilter)
      ) {
        return false;
      }
    }
    return true;
  });
}

function renderWho() {
  const mail = $("whoMail");
  const sel = $("who");
  const out = $("signOut");
  mail.hidden = false;
  mail.textContent = whoLabel(me());
  out.hidden = false;
  sel.hidden = true;
  sel.innerHTML = "";
}

function renderMonth() {
  const here = state.month === calendarMonth();
  $("monthLabel").textContent = monthLabel(state.month);
  $("monthMeta").textContent = here ? "This month" : "";
  $("monthLabel").parentElement.classList.toggle("this-month", here);
  const nav = $("navClose");
  if (nav) nav.textContent = monthLabel(state.month);
}

function setMonth(ym) {
  state.month = ym;
  state.selected.clear();
  state.designerFilter = null;
  localStorage.setItem(MONTH_KEY, ym);
  render();
}

function roleLine() {
  const p = me();
  const b = jobMeta(p);
  if (p.role === "designer") return `${b.code} ${b.title} · your queue · paste the result, then Done`;
  if (p.role === "art_director") return `${b.code} ${b.title} · storyboard → final art → Build`;
  if (p.role === "programmer") return `${b.code} ${b.title} · Build → paste HTML, then HTML ready`;
  if (p.role === "teamlead") return `${b.code} ${b.title} · assign people · your own tasks like MD`;
  if (p.role === "manager") {
    return state.direction === "playables"
      ? `${b.code} ${b.title} · billed hours · Send storyboard, then HTML`
      : `${b.code} ${b.title} · hours · Send to client after Done`;
  }
  if (p.role === "finance") return `${b.code} ${b.title} · studio money · MGX and Playables on one tab`;
  if (p.role === "client") return `Hours this month · MGX and Playables · the list invoices are based on`;
  return "";
}

function renderChrome() {
  syncDirection();
  $("financeNav").hidden = !isFinance();
  if ($("inboxWrap")) $("inboxWrap").hidden = isClient();
  if ($("soundWrap")) {
    const hideSound = isClient() || isHoursPage();
    $("soundWrap").hidden = hideSound;
    if (hideSound) setSoundOpen(false);
  }
  document.title = isHoursPage() ? "Hours — Lisenbart Board" : "Lisenbart Board";
  const title = document.querySelector(".board-title");
  if (title) title.textContent = isClient() ? "Hours" : DIR_LABEL[state.direction] || DIR_LABEL.mgx;
  const pill = document.querySelector(".top-row > .pill");
  if (pill) {
    const play = state.direction === "playables";
    pill.className = play ? "pill dep-playables" : "pill dep-MGX";
    pill.textContent = play ? "Playables" : "MGX";
    pill.hidden = isClient();
  }
  const mgxNav = $("navMgx");
  const playNav = $("navPlay");
  const onBoard = state.view !== "close" && state.view !== "team";
  if (mgxNav) {
    mgxNav.hidden = isClient() || !canSeeDirection("mgx");
    mgxNav.classList.toggle("active", onBoard && state.direction === "mgx");
  }
  if (playNav) {
    playNav.hidden = isClient() || !canSeeDirection("playables");
    playNav.classList.toggle("active", onBoard && state.direction === "playables");
  }
  renderMonth();
  const meta = state.db?.meta || {};
  const brand = $("brandMode");
  if (brand) {
    if (meta.drivePulledAt || meta.driveMode === "read") {
      brand.textContent = "Drive · files";
    } else {
      brand.textContent = "";
    }
  }
  $("roleHint").textContent = roleLine();
  $("sideFoot").innerHTML = "";
  ensureDriveStatus();

  const tabs = [];
  if (isClient()) {
    tabs.push({ id: "report", label: "Hours" });
  } else {
    tabs.push({
      id: "board",
      label: isPerformer() ? "My projects" : isTeamLead() ? "All projects" : "Pipeline",
    });
    tabs.push({ id: "excel", label: "Excel" });
    if (canOps()) tabs.push({ id: "ready", label: "Ready to send" });
    if (isFinance()) {
      tabs.push({ id: "close", label: "Finance" });
      tabs.push({ id: "team", label: "Team" });
    }
    tabs.push({ id: "guide", label: "Як це працює" });
  }
  if (!tabs.some((t) => t.id === state.view)) state.view = isClient() ? "report" : "board";
  if (tabs.length <= 1) {
    $("views").innerHTML = "";
    $("views").hidden = true;
  } else {
    $("views").hidden = false;
    $("views").innerHTML = tabs
      .map(
        (t) =>
          `<button type="button" class="view-tab ${state.view === t.id ? "active" : ""}" data-view="${t.id}" role="tab" aria-selected="${state.view === t.id ? "true" : "false"}">${t.label}</button>`
      )
      .join("");
    $("views").querySelectorAll(".view-tab").forEach((el) => {
      el.addEventListener("click", () => {
        state.view = el.dataset.view;
        render();
      });
    });
  }
}

function renderToolbar() {
  if (state.view === "team" || state.view === "close" || state.view === "guide") {
    $("toolbar").innerHTML = "";
    return;
  }
  if (state.view === "report") {
    $("toolbar").innerHTML = `<input class="search" placeholder="Search project" />`;
    bindSearch();
    return;
  }
  if (state.view === "excel") {
    const drive = state.db?.meta?.driveLiveExcel || "";
    $("toolbar").innerHTML = `
      ${isFinance() ? `<button type="button" class="btn" id="btnDrivePull">Read Drive</button>` : ""}
      ${drive ? `<a class="btn" href="${escapeHtml(drive)}" target="_blank" rel="noreferrer">Open on Drive</a>` : ""}
      <input class="search" placeholder="Search project" />
    `;
    bindSearch();
    bindDriveButtons();
    return;
  }
  if (canOps()) {
    for (const id of [...state.selected]) {
      const t = state.db.tasks.find((x) => x.id === id);
      if (!isSendable(t)) state.selected.delete(id);
    }
  }
  const n = [...state.selected].filter((id) => isSendable(state.db.tasks.find((x) => x.id === id))).length;
  const drive = liveMonthDriveUrl();
  if (isExecView()) {
    $("toolbar").innerHTML = `
      ${drive ? `<a class="btn" href="${escapeHtml(drive)}" target="_blank" rel="noreferrer">Open Drive</a>` : ""}
      <input class="search" placeholder="Search project" />
    `;
  } else {
    $("toolbar").innerHTML = `
      ${isFinance() ? driveStrip() : ""}
      ${canOps() && state.view === "board" ? `<button type="button" class="btn primary" id="btnCreateTask">Create task</button>` : ""}
      <button class="btn orange" id="btnEmail">${state.direction === "playables" ? "Hours list" : "Shift email"}</button>
      ${drive ? `<a class="btn" href="${escapeHtml(drive)}" target="_blank" rel="noreferrer">Open Drive</a>` : ""}
      <button class="btn green" id="btnExport" ${n ? "" : "disabled"}>Send to client (${n})</button>
      <input class="search" placeholder="Search project" />
      <button class="btn ghost" id="btnClientLink">Copy SuperPlay link</button>
    `;
  }
  bindSearch();
  $("btnCreateTask")?.addEventListener("click", openCreateTask);
  $("btnEmail")?.addEventListener("click", () => {
    const play = state.direction === "playables";
    const title = $("emailModal")?.querySelector("h3");
    const lead = $("emailModal")?.querySelector("p");
    if (title) title.textContent = play ? "Hours list" : "Shift list";
    if (lead) {
      lead.innerHTML = play
        ? "One playable per line. Hours are billed hours, not shifts × 9. Example: <code>DS-P-060_MergeSolitaire 30</code>."
        : "One project per line. Creates the card, Drive folder, empty brief, and hours. Dash, space, or <code>|</code> before the hours — <code>shift</code> / <code>SHFT</code> / <code>SHIFT</code> all work.";
    }
    $("emailModal").classList.add("show");
  });
  $("btnExport")?.addEventListener("click", exportMonday);
  $("btnClientLink")?.addEventListener("click", copyClientPage);
  bindDriveButtons();
}
async function copyClientPage() {
  const ok = await copyText(clientLink());
  toast(ok ? "SuperPlay link copied" : "Copy failed");
}

function openCreateTask() {
  if (!canOps()) return;
  $("createTaskErr").textContent = "";
  $("createTaskName").value = "";
  $("createTaskModal").classList.add("show");
  $("createTaskName").focus();
}
function closeCreateTask() {
  $("createTaskModal").classList.remove("show");
}
let pendingDeleteIds = [];

function closeTaskDelete() {
  pendingDeleteIds = [];
  $("taskDelModal")?.classList.remove("show");
}

function askDeleteTasks(ids) {
  const list = [...new Set((ids || []).filter(Boolean))];
  if (!list.length || !canOps()) return;
  pendingDeleteIds = list;
  const first = state.db.tasks.find((x) => x.id === list[0]);
  const titleEl = $("taskDelTitle");
  const introEl = $("taskDelIntro");
  if (titleEl) {
    titleEl.textContent =
      list.length === 1
        ? `Delete ${first?.name || "this project"}?`
        : `Delete ${list.length} projects?`;
  }
  if (introEl) {
    introEl.textContent =
      "This removes it from the board and moves the Drive folder to trash. You cannot undo this.";
  }
  $("taskDelModal")?.classList.add("show");
}

async function confirmDeleteTasks() {
  const list = [...pendingDeleteIds];
  if (!list.length) return;
  const go = $("taskDelConfirm");
  if (go?.classList.contains("is-busy")) return;
  setBusy(go, true, "Deleting…");
  const path = list.length === 1 ? "/api/tasks/delete" : "/api/tasks/delete-many";
  const body =
    list.length === 1
      ? { id: list[0], role: me().role, actorId: me().id }
      : { ids: list, role: me().role, actorId: me().id };
  try {
    const out = await api(path, body);
    if (out.error || !out.state) {
      toast(out.error || "Could not delete");
      return;
    }
    closeTaskDelete();
    applyState(out.state);
    closeDrawer();
    toast(
      list.length === 1
        ? "Deleted on the board. Drive trash and Excel catch up in the background."
        : `Deleted ${list.length} on the board. Drive and Excel catch up in the background.`
    );
  } finally {
    setBusy(go, false);
  }
}
async function submitCreateTask() {
  const name = String($("createTaskName")?.value || "").replace(/\s+/g, " ").trim();
  const err = $("createTaskErr");
  if (!name) {
    if (err) err.textContent = "Paste the full project name";
    return;
  }
  const go = $("createTaskGo");
  if (go?.classList.contains("is-busy")) return;
  if (err) err.textContent = "";
  const wait = $("createTaskWait");
  if (wait) wait.hidden = false;
  setBusy(go, true, "Creating…");
  const cancel = $("createTaskCancel");
  if (cancel) cancel.disabled = true;
  let payload = {
    name,
    month: state.month,
    role: me().role,
    actorId: me().id,
    direction: state.direction,
  };
  let out = {};
  try {
    out = await api("/api/tasks/create", payload);
  } finally {
    if (wait) wait.hidden = true;
    setBusy(go, false);
    if (cancel) cancel.disabled = false;
  }
  if (out.error || !out.state) {
    if (err) err.textContent = out.error || "Could not create the task";
    return;
  }
  applyState(out.state);
  closeCreateTask();
  toast("Task on the board. Drive folder and Excel catch up in the background.");
  if (out.task?.id) openTask(out.task.id);
}

function renderKpis() {
  if (state.view === "close" || state.view === "team" || state.view === "guide" || state.view === "report") {
    $("kpis").innerHTML = "";
    return;
  }
  const tasks = visibleTasks();
  if (isPerformer() && state.view !== "excel") {
    const hours = tasks.reduce((s, t) => s + hoursForPerson(t, me().id), 0);
    const active = tasks.filter((t) =>
      ["wip", "revision", "tlcheck", "storyboard", "finalart", "build"].includes(t.studioStatus)
    ).length;
    $("kpis").innerHTML = `
      <div class="kpi"><b>${tasks.length}</b><span>assigned to me</span></div>
      <div class="kpi"><b>${active}</b><span>in progress</span></div>
      <div class="kpi"><b>${hours.toFixed(1)} h</b><span>my hours this month</span></div>
    `;
    return;
  }
  const month = monthTasks();
  const hours = month.reduce((s, t) => s + (Number(t.hours) || 0), 0);
  const readyKey = state.direction === "playables" ? "htmlready" : "done";
  const readyLabel = state.direction === "playables" ? "HTML ready" : "Done";
  const ready = month.filter((t) => t.studioStatus === readyKey).length;
  const doneOn = canOps() && state.designerFilter === "done";
  const doneKpi = canOps()
    ? `<button type="button" class="kpi${doneOn ? " on" : ""}" id="kpiDone" aria-pressed="${doneOn ? "true" : "false"}"><b>${ready}</b><span>${readyLabel}</span></button>`
    : `<div class="kpi"><b>${ready}</b><span>${readyLabel}</span></div>`;
  $("kpis").innerHTML = `
    <div class="kpi"><b>${month.length}</b><span>projects</span></div>
    <div class="kpi"><b>${hours.toFixed(1)} h</b><span>hours</span></div>
    ${doneKpi}
  `;
  $("kpiDone")?.addEventListener("click", () => {
    state.designerFilter = state.designerFilter === "done" ? null : "done";
    render();
  });
}

function initials(name) {
  return (name || "?").slice(0, 1);
}
function avatarHtml(p, name) {
  const inner = p?.avatarStar ? "🌟" : escapeHtml(initials(name || displayName(p)));
  return `<span class="avatar${p?.avatarStar ? " is-star" : ""}" style="background:${p?.color || "#c5c7d0"}">${inner}</span>`;
}
function jobMeta(p) {
  return JOB_BADGE[p?.role] || { code: "?", title: ROLE_LABEL[p?.role] || p?.role || "" };
}
function jobBadgeHtml(p) {
  const b = jobMeta(p);
  return `<span class="job-badge job-${escapeHtml(b.code.toLowerCase())}" title="${escapeHtml(b.title)}">${escapeHtml(b.code)}</span>`;
}
function personCell(id) {
  const p = person(id);
  if (!p) return `<span class="empty">unassigned</span>`;
  return `<span class="person">${avatarHtml(p)}${escapeHtml(displayName(p))}${jobBadgeHtml(p)}</span>`;
}
function whoCell(t) {
  const base = personCell(t.assigneeId);
  const help = helpEntries(t);
  const extra = [];
  if (help.length) {
    const names = help.map((row) => person(row.id)?.name || row.id).join(", ");
    extra.push(`<small class="help-mark" title="${escapeHtml(names)}">+${help.length}</small>`);
  }
  if (isPlayables(t) && t.programmerId && t.programmerId !== t.assigneeId) {
    extra.push(personCell(t.programmerId));
  }
  if (isPlayables(t) && t.motionId && t.motionId !== t.assigneeId && t.motionId !== t.programmerId) {
    extra.push(personCell(t.motionId));
  }
  if (!extra.length) return base;
  return `<span class="who-stack">${base}${extra.join("")}</span>`;
}
function normalizeDriveFolder(url) {
  const raw = String(url || "");
  const open = raw.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/i);
  if (open) return `https://drive.google.com/drive/folders/${open[1]}`;
  const fold = raw.match(/https:\/\/drive\.google\.com\/drive\/folders\/[a-zA-Z0-9_-]+/i);
  return fold ? fold[0] : "";
}
function driveFolderIn(text) {
  return normalizeDriveFolder(text);
}
function labeledWorkFolder(text) {
  const m = String(text || "").match(
    /(?:working folder|pls work here|please work here|work here|pls work)[:\s]*\n*(https:\/\/drive\.google\.com\/(?:drive\/folders\/|open\?id=)[a-zA-Z0-9_-]+)/i
  );
  return m ? normalizeDriveFolder(m[1]) : "";
}
function workFolder(t) {
  return labeledWorkFolder(t?.brief) || String(t?.folderUrl || "").trim();
}
function packLinksHtml(t) {
  const work = workFolder(t);
  const brief = t.docUrl
    ? `<a class="btn pack-brief" href="${escapeHtml(t.docUrl)}" target="_blank" rel="noreferrer">Open brief</a>`
    : "";
  const folder = work
    ? `<a class="btn pack-folder" href="${escapeHtml(work)}" target="_blank" rel="noreferrer">Open folder</a>`
    : "";
  if (!brief && !folder) return "";
  return `<div class="pack-links">${brief}${folder}</div>`;
}
function parseBrief(t) {
  const raw = String(t?.brief || "").trim();
  const urls = raw.match(/https?:\/\/[^\s)<>"]+/gi) || [];
  const fileUrl =
    urls.find((u) => /\/file\//i.test(u) || /\.(mp4|mov|mkv)(\?|$)/i.test(u)) || "";
  const downloads = [
    ...raw.matchAll(/download\s*[-–—:]?\s*(\S+\.(?:mp4|mov|mkv))/gi),
  ].map((m) => m[1]);
  return { raw, fileUrl, downloads };
}
function linkifyBrief(text) {
  return escapeHtml(text).replace(
    /(https:\/\/[^\s<]+)/g,
    '<a class="pin-link" href="$1" target="_blank" rel="noreferrer">$1</a>'
  );
}
function pinHtml(t) {
  const raw = String(t?.brief || "").trim();
  const body = canOps()
    ? `<textarea id="stBrief" class="pin-edit" rows="8" placeholder="Paste the brief here, then Save. It also writes the Google Doc.">${escapeHtml(raw)}</textarea>`
    : raw
    ? `<div class="pin-body">${linkifyBrief(raw)}</div>`
    : `<div class="pin-body is-empty">No brief yet</div>`;
  const work = workFolder(t);
  const briefBtn = t.docUrl
    ? `<a class="btn pack-brief" href="${escapeHtml(t.docUrl)}" target="_blank" rel="noreferrer">Open brief</a>`
    : "";
  const folderBtn = work
    ? `<a class="btn pack-folder" href="${escapeHtml(work)}" target="_blank" rel="noreferrer">Open folder</a>`
    : "";
  const retry = canOps() && t.source === "portal" && !folderBtn
    ? `<button type="button" class="btn" id="ensureDrive">Create Drive folder</button>`
    : "";
  const actions = briefBtn || folderBtn || retry
    ? `<footer class="pin-actions">${briefBtn}${folderBtn}${retry}</footer>`
    : "";
  const warn = canOps() && t.source === "portal" && !work
    ? `<p class="drive-warn">No Drive folder yet. Click Create Drive folder.</p>`
    : "";
  return `<article class="pin">
      <header class="pin-head">Brief</header>
      ${warn}
      ${body}
      ${actions}
    </article>`;
}
function driveFileId(url) {
  const text = String(url || "");
  const file = text.match(/\/file\/d\/([a-zA-Z0-9_-]+)/i);
  if (file) return file[1];
  const id = text.match(/[?&]id=([a-zA-Z0-9_-]+)/i);
  return id ? id[1] : "";
}
function shotThumb(url) {
  const id = driveFileId(url);
  if (id) return `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w480`;
  if (/\.(?:png|jpe?g|gif|webp|bmp)(?:\?|$)/i.test(url)) return url;
  return "";
}
function commentWhen(at) {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
function isLocalShotUrl(url) {
  const u = String(url || "");
  return u.includes("/api/comment-file") || u.startsWith("/comments/");
}
function shotSrc(a) {
  const url = String(a?.url || "");
  if (url.startsWith("data:image") || isLocalShotUrl(url)) return url;
  if (a?.kind === "image") return shotThumb(url) || url;
  return shotThumb(url);
}
function isShot(a) {
  const url = String(a?.url || "");
  return a?.kind === "image" || url.startsWith("data:image") || isLocalShotUrl(url) || Boolean(shotThumb(url));
}
function closeShot() {
  const box = $("shotBox");
  if (!box) return;
  box.hidden = true;
  const img = box.querySelector("img");
  if (img) img.removeAttribute("src");
}
function projectRoot(t) {
  const m = String(t?.name || "").trim().match(/^([A-Z]{2}-[A-Z0-9]+-\d+(?:-\d+)?)/i);
  const raw = (m ? m[1].toUpperCase() : String(t?.id || "SHOT")).replace(/[^A-Z0-9-]/g, "");
  return raw || "SHOT";
}
function allShotAtts(t) {
  const out = [];
  for (const row of clientComments(t)) {
    for (const att of row.attachments || []) {
      if (isShot(att)) out.push(att);
    }
  }
  return out;
}
function shotFileName(t, att) {
  if (att?.name) return att.name;
  const shots = allShotAtts(t);
  const total = shots.length;
  const index = Math.max(1, shots.indexOf(att) + 1);
  const extMatch = String(att?.url || "").match(/\.(png|jpe?g|gif|webp)(?:\?|$)/i);
  const ext = (extMatch ? extMatch[1] : "png").toLowerCase().replace("jpeg", "jpg");
  const root = projectRoot(t);
  if (total <= 1) return `${root}.${ext}`;
  return `${root}_${String(index).padStart(2, "0")}.${ext}`;
}
function mimeFromName(name) {
  const ext = String(name || "").split(".").pop().toLowerCase();
  return { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" }[ext] || "image/png";
}
function safeShotName(name) {
  return String(name || "screenshot.png").replace(/[/\\?%*:|"<>]/g, "-") || "screenshot.png";
}
function dataToBlob(src) {
  const comma = src.indexOf(",");
  if (comma < 0) throw new Error("bad image");
  const header = src.slice(0, comma);
  const body = src.slice(comma + 1);
  const mime = (header.match(/data:([^;]+)/i) || [, "image/png"])[1];
  if (/;base64/i.test(header)) {
    const bin = atob(body);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }
  return new Blob([decodeURIComponent(body)], { type: mime });
}
function triggerNamedDownload(blob, file) {
  const objectUrl = URL.createObjectURL(new File([blob], file, { type: blob.type || mimeFromName(file) }));
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = file;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
}
function saveShot(src, name) {
  const file = safeShotName(name);
  const startPicker = (blob) => {
    const picker = window.showSaveFilePicker;
    if (typeof picker !== "function") {
      triggerNamedDownload(blob, file);
      return;
    }
    const ext = "." + (file.split(".").pop() || "png").toLowerCase();
    picker({
      suggestedName: file,
      types: [{ description: "Screenshot", accept: { [blob.type || mimeFromName(file)]: [ext] } }],
    })
      .then(async (handle) => {
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
      })
      .catch((err) => {
        if (err && err.name === "AbortError") return;
        triggerNamedDownload(blob, file);
      });
  };
  if (String(src).startsWith("data:")) {
    try {
      startPicker(dataToBlob(src));
      return;
    } catch {
      /* fall through */
    }
  }
  const a = document.createElement("a");
  a.href = src;
  a.download = file;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
function bindShotSave(el, src, name) {
  if (!el) return;
  el.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    e.stopPropagation();
    saveShot(src, name);
  });
}
function openShot(src, name) {
  if (!src) return;
  let box = $("shotBox");
  if (!box) {
    box = document.createElement("div");
    box.id = "shotBox";
    box.className = "shot-box";
    box.hidden = true;
    box.innerHTML = `<button type="button" class="shot-box-x" aria-label="Close">×</button><a class="shot-box-dl" href="#" download>Download</a><img alt="Screenshot">`;
    document.body.appendChild(box);
    box.querySelector(".shot-box-x").addEventListener("click", (e) => {
      e.stopPropagation();
      closeShot();
    });
    box.addEventListener("click", (e) => {
      if (e.target === box) closeShot();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !box.hidden) closeShot();
    });
    const img = box.querySelector("img");
    const dl = box.querySelector(".shot-box-dl");
    img.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      saveShot(box.dataset.src, box.dataset.file);
    });
    dl.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      saveShot(box.dataset.src, box.dataset.file);
    });
  }
  const file = safeShotName(name);
  const img = box.querySelector("img");
  const dl = box.querySelector(".shot-box-dl");
  box.dataset.src = src;
  box.dataset.file = file;
  img.alt = file;
  img.title = `Save as ${file}`;
  img.src = src;
  if (dl) {
    dl.href = src;
    dl.download = file;
    dl.textContent = file;
  }
  box.hidden = false;
}
function notesShotsHtml(row) {
  const files = (row.attachments || []).filter((a) => a?.url);
  if (!files.length) return "";
  return `<div class="notes-shots">${files
    .map((a, i) => {
      if (isShot(a)) {
        return `<button type="button" class="notes-shot" data-comment="${escapeHtml(row.id || "")}" data-i="${i}">
          <img alt="Screenshot" />
        </button>`;
      }
      return `<a class="pin-link" href="${escapeHtml(a.url)}" target="_blank" rel="noreferrer">Open link</a>`;
    })
    .join("")}</div>`;
}
function bindNoteShots(t) {
  $("drawer")?.querySelectorAll(".notes-shot").forEach((btn) => {
    const comment = clientComments(t).find((row) => row.id === btn.dataset.comment);
    const att = (comment?.attachments || [])[Number(btn.dataset.i)];
    const src = shotSrc(att) || att?.url || "";
    const img = btn.querySelector("img");
    const file = shotFileName(t, att);
    if (img && src) {
      img.src = src;
      img.alt = file;
      img.title = `Save as ${file}`;
      img.addEventListener("error", () => btn.remove());
      bindShotSave(img, src, file);
    }
    bindShotSave(btn, src, file);
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openShot(img?.currentSrc || img?.src || src, file);
    });
  });
}
function notesHtml(t) {
  const rows = clientComments(t);
  const canWrite = canWriteNotes();
  if (!rows.length && !canWrite) return "";
  const items = rows
    .map(
      (row) => `<article class="notes-item" data-id="${escapeHtml(row.id || "")}">
        <header class="notes-meta">
          <strong>${escapeHtml(row.authorName || person(row.authorId)?.name || "Client")}</strong>
          <span>${escapeHtml(commentWhen(row.at))}${row.source === "monday" ? " · Monday" : ""}</span>
          ${
            canWrite && row.source !== "monday" && row.id
              ? `<button type="button" class="notes-del" data-id="${escapeHtml(row.id)}" aria-label="Remove note">×</button>`
              : ""
          }
        </header>
        <div class="notes-body">${linkifyBrief(row.body || "")}</div>
        ${notesShotsHtml(row)}
      </article>`
    )
    .join("");
  const composer = canWrite
    ? `<div class="notes-compose" id="stCommentBox">
        <textarea id="stComment" rows="3" placeholder="Paste client text, or paste / drop a screenshot"></textarea>
        <div class="notes-shots" id="stCommentShots"></div>
        <p class="io-hint">Brief stays as is. Paste a screenshot (Ctrl+V) or attach a file. Links still work.</p>
        <div class="notes-compose-actions">
          <label class="btn ghost" for="stCommentFiles">Attach screenshot</label>
          <input id="stCommentFiles" type="file" accept="image/*" multiple hidden />
          <button class="btn" type="button" id="addNote">Add note</button>
        </div>
      </div>`
    : "";
  return `<section class="notes${rows.length ? "" : " is-empty"}">
      <header class="notes-head">Client notes</header>
      ${items || (canWrite ? `<p class="notes-empty">No client notes yet</p>` : "")}
      ${composer}
    </section>`;
}
function sourceHtml(t) {
  const parts = parseBrief(t);
  const videoBtn = parts.fileUrl
    ? `<a class="btn pack-brief" href="${escapeHtml(parts.fileUrl)}" target="_blank" rel="noreferrer">Open video</a>`
    : "";
  const files = parts.downloads
    .map((f) => `<span class="file-chip">${escapeHtml(f)}</span>`)
    .join("");
  if (!videoBtn && !files) return "";
  return `<section class="io io-source">
      <h3>Source</h3>
      ${videoBtn}${files ? `<div class="file-row">${files}</div>` : ""}
    </section>`;
}
function resultHtml(t, performer, canPaste) {
  if (!showResultField(t)) return "";
  const play = isPlayables(t);
  const body = canPaste
    ? `<input id="stResult" value="${escapeHtml(t.resultUrl || "")}" placeholder="${play ? "Paste HTML / playable link" : "Paste finished file link"}" />
        <p class="io-hint">${play ? "HTML ready needs this link." : performer ? "The file, not the folder." : "Needed before Send to client."}</p>`
    : t.resultUrl
      ? `<a class="pin-link" href="${escapeHtml(t.resultUrl)}" target="_blank" rel="noreferrer">Open result</a>`
      : `<p class="io-empty">Waiting for ${escapeHtml(person(t.programmerId || t.assigneeId)?.name || "designer")}</p>`;
  return `<section class="io io-result${performer ? " is-focus" : ""}">
      <h3>${play ? "HTML" : "Result"}</h3>
      ${body}
    </section>`;
}
function hasDriveDoc(t) {
  return Boolean(String(t?.docUrl || "").trim());
}
function hasDriveFolder(t) {
  return Boolean(workFolder(t));
}
function cardJob(t) {
  const role = me().role;
  const mine = t.assigneeId === me().id;
  const hasResult = Boolean(String(t.resultUrl || "").trim());
  const who = person(t.assigneeId);
  const name = who ? displayName(who) : "";
  if (isPlayables(t)) return playableCardJob(t, { role, mine, hasResult, name });
  if (role === "designer") {
    if (!mine && helpedOn(t, me().id)) {
      const share = hoursForPerson(t, me().id);
      return {
        tone: "ok",
        title: "You helped",
        body: `${share}h studio pay on this task. ${name || "Who"} still owns Done.`,
      };
    }
    if (t.studioStatus === "closed") {
      return { tone: "ok", title: "Closed", body: "Client accepted. This task is finished." };
    }
    if (t.studioStatus === "approve") {
      return { tone: "ok", title: "Sent to client", body: "LP already sent this. Nothing else on this card." };
    }
    if (t.studioStatus === "tlcheck") {
      return { tone: "wait", title: "Waiting for TL", body: "Result is in. Team Lead checks it, then Done." };
    }
    if (t.studioStatus === "done") {
      return { tone: "wait", title: "Waiting for LP", body: "TL already checked. Line Producer sends it to the client." };
    }
    if (t.studioStatus === "revision") {
      return {
        tone: "fix",
        title: "Need Fixing",
        body: clientComments(t).length
            ? "Client notes are under the brief. Fix, paste the new result link, then TL Check."
          : "Fix the work, paste the new result link, then TL Check.",
      };
    }
    if (!hasResult) {
      return {
        tone: "do",
        title: "Your job",
        body: "Open the brief, set WIP when you start, paste the finished-file link, then TL Check.",
      };
    }
    return { tone: "do", title: "TL Check", body: "Result link is in. Set TL Check so the Team Lead can review." };
  }
  if (role === "teamlead") {
    if (!t.assigneeId) {
      return { tone: "do", title: "Your job", body: "Assign a designer. They see it in their queue after Save." };
    }
    if (mine && t.studioStatus !== "done" && t.studioStatus !== "approve" && t.studioStatus !== "closed") {
      if (t.studioStatus === "revision") {
        return { tone: "fix", title: "This is your work · Need Fixing", body: "Fix, paste the new result link, then TL Check." };
      }
      if (t.studioStatus === "tlcheck") {
        return { tone: "do", title: "Your work · TL Check", body: "Result is in. Set Done when you accept it." };
      }
      if (!hasResult) {
        return { tone: "do", title: "This is your work", body: "Same as MD: paste the result link, then TL Check." };
      }
      return { tone: "do", title: "TL Check", body: "Result link is in. Set TL Check, then Done." };
    }
    if (t.studioStatus === "tlcheck") {
      return { tone: "do", title: "Your job", body: `${name || "Designer"} submitted. Check the result, then Done.` };
    }
    if (t.studioStatus === "done") {
      return { tone: "wait", title: "Waiting for LP", body: `${name || "Designer"} passed TL Check. You cannot Send to client — that is LP.` };
    }
    if (t.studioStatus === "closed") {
      return { tone: "ok", title: "Closed", body: "Client accepted. This task is finished." };
    }
    if (t.studioStatus === "approve") {
      return { tone: "ok", title: "Sent to client", body: "Nothing else on this card." };
    }
    if (t.studioStatus === "revision") {
      return { tone: "fix", title: "Need Fixing", body: `${name || "Designer"} must fix and paste a new result.` };
    }
    return { tone: "wait", title: "Assigned", body: `${name || "They"} work this. Reassign here if the person is wrong.` };
  }
  if (t.studioStatus === "closed") {
    return { tone: "ok", title: "Closed", body: "Client accepted. Hours stay on this month." };
  }
  if (t.studioStatus === "approve") {
    return { tone: "ok", title: "Already sent", body: "Copy the Monday reply if External Weekly still needs it. Mark Closed when the client accepts." };
  }
  if (t.studioStatus === "done" && hasResult) {
    return { tone: "do", title: "Your job", body: "Result is in. Send to client, or Mark Closed if SuperPlay already accepted." };
  }
  if (t.studioStatus === "tlcheck") {
    return { tone: "wait", title: "Waiting for TL", body: `${name || "Designer"} submitted for TL Check. Send only after TL sets Done.` };
  }
  if (!t.assigneeId) {
    return { tone: "wait", title: "Waiting for TL", body: "Set hours if needed. Team Lead assigns. Status stays Ready until MD sets WIP. You send only after Done." };
  }
  if (t.studioStatus === "revision") {
    return { tone: "wait", title: "In Need Fixing", body: `${name || "Designer"} is fixing. Send only after they mark Done again.` };
  }
  return {
    tone: "wait",
    title: "In progress",
    body: `${name || "Designer"} is on this. Send only when status is Done and the result link is pasted.`,
  };
}
function playableCardJob(t, { role, mine, hasResult, name }) {
  const st = t.studioStatus || "new";
  const prog = person(t.programmerId);
  const progName = prog ? displayName(prog) : "";
  if (role === "art_director") {
    if (!mine && helpedOn(t, me().id)) {
      return { tone: "ok", title: "You helped", body: `${hoursForPerson(t, me().id)}h on this playable. ${name || "Lead AD"} owns the card.` };
    }
    if (st === "closed") return { tone: "ok", title: "Closed", body: "Client accepted. This playable is finished." };
    if (st === "approve") return { tone: "ok", title: "Sent to client", body: "LP already sent the HTML. Nothing else on this card." };
    if (st === "htmlready") return { tone: "wait", title: "Waiting for LP", body: "HTML is in. Line Producer sends it to the client." };
    if (st === "build") return { tone: "wait", title: "In Build", body: `${progName || "Programmer"} builds the HTML.` };
    if (st === "clientart") return { tone: "wait", title: "Client art", body: "Storyboard is with the client. Wait, or set Storyboard if they bounced it." };
    if (st === "finalart") return { tone: "do", title: "Final art", body: "Finish art, then set Build when DEV can start." };
    if (st === "storyboard") return { tone: "wait", title: "Waiting for LP", body: "Storyboard is ready. LP sends it. Only LP talks to the client." };
    return { tone: "do", title: "Your job", body: "Open the brief. Set Storyboard when the board is ready for the client." };
  }
  if (role === "programmer") {
    if (st === "closed" || st === "approve") return { tone: "ok", title: st === "closed" ? "Closed" : "Sent to client", body: "Nothing else on this card." };
    if (st === "htmlready") return { tone: "wait", title: "Waiting for LP", body: "HTML link is in. Line Producer sends it." };
    if (st === "build" || mine || t.programmerId === me().id) {
      if (!hasResult) return { tone: "do", title: "Your job", body: "Build the playable, paste the HTML link, then HTML ready." };
      return { tone: "do", title: "HTML ready", body: "Link is in. Set HTML ready so LP can send." };
    }
    return { tone: "wait", title: "Not on you yet", body: "Art is still in progress. You see this when LP/AD puts you on Build." };
  }
  if (role === "designer") {
    if (st === "finalart" || st === "storyboard") {
      return { tone: "do", title: "Art help", body: "You have hours on this playable. Lead AD owns status." };
    }
    return { tone: "wait", title: "On this playable", body: `${hoursForPerson(t, me().id)}h studio pay. Lead AD owns the card.` };
  }
  if (st === "closed") return { tone: "ok", title: "Closed", body: "Client accepted. Hours stay on this month." };
  if (st === "approve") return { tone: "ok", title: "Already sent", body: "HTML is with the client. Mark Closed when they accept." };
  if (st === "htmlready" && hasResult) return { tone: "do", title: "Your job", body: "HTML is in. Send to client, or Mark Closed if they already accepted." };
  if (st === "storyboard") return { tone: "do", title: "Your job", body: "Storyboard is ready. Send to client — only LP talks to SuperPlay." };
  if (st === "clientart") return { tone: "wait", title: "Client art", body: "Waiting on the client. Storyboard if they bounce it." };
  if (st === "build") return { tone: "wait", title: "In Build", body: `${progName || "Programmer"} is on HTML. Send after HTML ready.` };
  if (st === "finalart") return { tone: "wait", title: "Final art", body: `${name || "Art Director"} is finishing art.` };
  if (!t.assigneeId) return { tone: "do", title: "Assign lead AD", body: "Primary Art Director is required. Split a second AD in hours if needed." };
  return { tone: "wait", title: "In progress", body: `${name || "Art Director"} is on this. Send storyboard, then HTML.` };
}
function showResultField(t) {
  if (String(t.resultUrl || "").trim()) return true;
  if (isPlayables(t)) {
    if (onMyPlayable(t) && (isArtDirector() || isProgrammer() || isDesigner() || isTeamLead())) return true;
    if (canOps() && ["build", "htmlready", "approve", "closed"].includes(t.studioStatus)) return true;
    return false;
  }
  if (t.assigneeId === me().id && (isDesigner() || isTeamLead())) return true;
  if (canOps() && t.studioStatus !== "new") return true;
  return false;
}
function fillDrivePackIfMissing(t) {
  if (!isStudioHost() || !canOps()) return;
  if ((hasDriveDoc(t) && hasDriveFolder(t)) || state.driveTried[t.id]) return;
  state.driveTried[t.id] = true;
  api("/api/drive/ensure", { id: t.id, month: state.month, role: me().role }).then((out) => {
    const hadDoc = hasDriveDoc(t);
    if (out.state) applyState(out.state);
    if (out.ok && state.openId === t.id) openTask(t.id);
    else if (out.error) toast(out.error);
    if (out.ok && out.docUrl && !hadDoc) toast("Linked the brief Doc from Drive");
  });
}
async function retryDrivePack(t) {
  state.driveTried[t.id] = false;
  let out = await api("/api/drive/ensure", { id: t.id, month: state.month, role: me().role });
  if (out.error || !out.ok) {
    toast(out.error || "Drive folder was not created");
    if (state.openId === t.id) openTask(t.id);
    return;
  }
  if (out.state) applyState(out.state);
  toast("Drive folder + brief Doc ready");
  if (state.openId === t.id) openTask(t.id);
}

function bindDriveButtons() {
  $("btnDrivePull")?.addEventListener("click", pullDrive);
  const excelBtn = $("btnExcelPull");
  if (excelBtn && !excelBtn.dataset.bound) {
    excelBtn.dataset.bound = "1";
    excelBtn.addEventListener("click", pullExcel);
  }
}
function timeCell(t) {
  const hours = t.hours || hoursFromShifts(t.shifts || 0);
  if (isPlayables(t)) {
    if (canEditTime()) {
      return `<span class="time-edit">
      <input class="hours-in" data-id="${t.id}" type="number" min="0" step="0.1" value="${t.hours ?? ""}" title="Billed hours (may include studio buffer)" />
      <small>h</small>
    </span>`;
    }
    return hours ? `${hours}h` : `<span class="empty">—</span>`;
  }
  if (canEditTime()) {
    return `<span class="time-edit">
      <input class="shift-in" data-id="${t.id}" type="number" min="0" step="0.1" value="${t.shifts ?? ""}" title="Shifts · hours = shifts × ${shiftHours()}" />
      <small>${hours ? hours + "h" : "—"}</small>
    </span>`;
  }
  if (!t.shifts && !t.hours) return `<span class="empty">—</span>`;
  return `${t.shifts || "—"} / ${hours || "—"}h`;
}

function statusRank(t) {
  return STATUS[t.studioStatus]?.order || 99;
}

function sortedTasks(list) {
  return list.slice().sort((a, b) => {
    const d = statusRank(a) - statusRank(b);
    if (d) return d;
    return String(a.name).localeCompare(String(b.name));
  });
}

function loadTone(hours, fair) {
  if (!hours) return "empty";
  if (!fair) return "even";
  if (hours < fair * 0.7) return "light";
  if (hours > fair * 1.3) return "heavy";
  return "even";
}

function renderLoad() {
  const box = $("load");
  if (!box) return;
  if (
    isClient() ||
    isDesigner() ||
    isArtDirector() ||
    isProgrammer() ||
    state.view === "close" ||
    state.view === "team" ||
    state.view === "excel" ||
    state.view === "guide" ||
    state.view === "report"
  ) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }
  box.hidden = false;
  const people = boardPeople();
  const tasks = monthTasks();
  const rows = people.map((p) => {
    const mine = tasks.filter((t) => hoursForPerson(t, p.id) > 0);
    const hours = mine.reduce((s, t) => s + hoursForPerson(t, p.id), 0);
    return { person: p, mine, count: mine.length, hours };
  });
  const unassigned = tasks.filter((t) => !t.assigneeId);
  const unHours = unassigned.reduce((s, t) => s + (Number(t.hours) || 0), 0);
  const assignedHours = rows.reduce((s, r) => s + r.hours, 0);
  const fair = people.length ? assignedHours / people.length : 0;
  const maxH = Math.max(fair, ...rows.map((r) => r.hours), 0.1);
  const cards = rows
    .map((r) => {
      const tone = loadTone(r.hours, fair);
      const on = state.designerFilter === r.person.id ? " on" : "";
      const ticks = r.mine.length
        ? r.mine.map((t) => `<i class="tick line-${t.line}" title="${escapeHtml(t.name)}"></i>`).join("")
        : `<i class="tick none"></i>`;
      const pct = Math.round((r.hours / maxH) * 100);
      const fairPct = Math.round((fair / maxH) * 100);
      return `<button type="button" class="load-card ${tone}${on}" data-filter="${r.person.id}">
        <div class="load-top">${personCell(r.person.id)}<span class="load-tag">${tone}</span></div>
        <div class="load-nums"><b>${r.count}</b> projects · <b>${r.hours.toFixed(1)} h</b></div>
        <div class="ticks">${ticks}</div>
        <div class="load-bar"><span class="load-fill" style="width:${pct}%"></span><span class="load-fair" style="left:${fairPct}%"></span></div>
      </button>`;
    })
    .join("");
  const unOn = state.designerFilter === "unassigned" ? " on" : "";
  box.innerHTML = `
    <div class="load-head">
      <strong>Load</strong>
    </div>
    <div class="load-row">
      ${cards}
      <button type="button" class="load-card unassigned${unOn}" data-filter="unassigned">
        <div class="load-top"><span class="person"><span class="avatar" style="background:#c5c7d0">?</span>Unassigned</span><span class="load-tag">open</span></div>
        <div class="load-nums"><b>${unassigned.length}</b> projects · <b>${unHours.toFixed(1)} h</b></div>
        <div class="ticks">${unassigned.map((t) => `<i class="tick line-${t.line}" title="${escapeHtml(t.name)}"></i>`).join("") || `<i class="tick none"></i>`}</div>
      </button>
    </div>`;
  box.querySelectorAll(".load-card").forEach((el) => {
    el.addEventListener("click", () => {
      const id = el.dataset.filter;
      state.designerFilter = state.designerFilter === id ? null : id;
      render();
    });
  });
}

function projectShort(name) {
  const parts = String(name || "")
    .split(/[_|]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const skip = (p) =>
    /^(DD|DX|DS)[-]/i.test(p) ||
    /^(EN|JA|IT|DE|FR|UA|LOC|HC|MGX|Comp|Resize)$/i.test(p) ||
    /^\d+s$/i.test(p) ||
    /SettAI/i.test(p);
  const nice = parts.filter((p) => !skip(p) && /[A-Za-z]{3,}/.test(p));
  return nice[0] || parts[1] || String(name).slice(0, 28);
}

function excelDate(value) {
  const m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}`;
  return value || "";
}
function parseDeadlineIso(value) {
  const s = String(value || "").trim();
  if (!s) return "";
  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  const dmy = s.match(/^(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?$/);
  if (!dmy) return "";
  const year = dmy[3]
    ? dmy[3].length === 2
      ? `20${dmy[3]}`
      : dmy[3]
    : String(state.month || "").slice(0, 4) || "2026";
  return `${year}-${String(dmy[2]).padStart(2, "0")}-${String(dmy[1]).padStart(2, "0")}`;
}
function deadlineMark(t) {
  const iso = parseDeadlineIso(t.deadline);
  if (!iso) return { cls: "none", iso: "", label: "—", title: "No deadline", fill: 0 };
  const due = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(due.getTime())) return { cls: "none", iso: "", label: "—", title: "No deadline", fill: 0 };
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const start = new Date(`${t.month || state.month}-01T12:00:00`);
  const span = Math.max(1, due - start);
  const fill = Math.max(0, Math.min(1, (today - start) / span));
  const days = Math.round((due - today) / 86400000);
  const label = excelDate(iso);
  if (t.studioStatus === "closed") return { cls: "closed", iso, label, title: "Closed", fill };
  if (days < 0) return { cls: "late", iso, label, title: `${-days}d late`, fill: 1 };
  if (days === 0) return { cls: "soon", iso, label, title: "Due today", fill };
  if (days <= 2) return { cls: "soon", iso, label, title: `${days}d left`, fill };
  return { cls: "ok", iso, label, title: `${days}d left`, fill };
}
function dueCell(t) {
  const d = deadlineMark(t);
  return `<div class="due due-${d.cls}" title="${escapeHtml(d.title)}"><span>${escapeHtml(d.label)}</span><i class="due-bar" aria-hidden="true"><b style="width:${Math.round(d.fill * 100)}%"></b></i></div>`;
}

function fmtHours(n) {
  if (n === "" || n == null || Number.isNaN(Number(n))) return "";
  return Number(n).toFixed(1).replace(".", ",");
}

function fmtReportNum(n, digits) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "";
  const rounded = Math.round(x * 10 ** digits) / 10 ** digits;
  return String(rounded);
}

function viewerZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
function viewerCity(zone) {
  const part = String(zone || "UTC").split("/").pop() || "UTC";
  return part.replace(/_/g, " ");
}
function stampParts(d) {
  const zone = viewerZone();
  const at = d || new Date();
  const date = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(at);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(at);
  return { date, time, city: viewerCity(zone), zone };
}
let hoursStampTimer = 0;
function paintHoursStamp() {
  const el = $("spStamp");
  if (!el) return false;
  const { date, time, city } = stampParts();
  el.innerHTML = `<b>${escapeHtml(date)}</b><span>${escapeHtml(time)} ${escapeHtml(city)}</span>`;
  return true;
}
function startHoursStamp() {
  paintHoursStamp();
  clearInterval(hoursStampTimer);
  hoursStampTimer = setInterval(() => {
    if (!paintHoursStamp()) clearInterval(hoursStampTimer);
  }, 1000);
}
function hoursStampKpi() {
  const { date, time, city } = stampParts();
  return `<div class="kpi sp-stamp" id="spStamp"><b>${escapeHtml(date)}</b><span>${escapeHtml(time)} ${escapeHtml(city)}</span></div>`;
}
function hoursXlsxName(res) {
  const raw = res.headers.get("Content-Disposition") || "";
  const m = raw.match(/filename="([^"]+)"/i);
  return m ? m[1] : `SUPERPLAY_hours_${state.month}.xlsx`;
}
function bindHoursDownload() {
  $("btnHoursXlsx")?.addEventListener("click", downloadHoursXlsx);
}
async function downloadHoursXlsx() {
  const btn = $("btnHoursXlsx");
  setBusy(btn, true, "Building…");
  try {
    const qs = new URLSearchParams({ month: state.month, tz: viewerZone() });
    const res = await fetch(`/api/hours/file?${qs}`, {
      credentials: "same-origin",
    });
    if (res.status === 401) {
      writeSession(null);
      showLogin();
      return;
    }
    if (!res.ok) {
      toast("Could not build the hours table");
      return;
    }
    const blob = await res.blob();
    triggerNamedDownload(blob, hoursXlsxName(res));
  } catch {
    toast("Could not build the hours table");
  } finally {
    setBusy(btn, false);
  }
}

function reportSections(tasks) {
  const sections = [];
  for (const dir of ["mgx", "playables"]) {
    const prefix = dir === "playables" ? "Playable" : "MGX";
    const bucket = tasks.filter((t) => directionOf(t) === dir);
    const lines = ["DX", "DD"];
    if (bucket.some((t) => t.line === "DS")) lines.push("DS");
    for (const line of lines) {
      const rows = bucket
        .filter((t) => t.line === line)
        .slice()
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));
      if (!rows.length) continue;
      sections.push({
        line,
        label: `${prefix} ${line}`,
        rows,
        shifts: rows.reduce((s, t) => s + (Number(t.shifts) || 0), 0),
        hours: rows.reduce((s, t) => s + hoursOf(t), 0),
      });
    }
  }
  return sections;
}

function renderClientReport() {
  const q = searchQuery();
  const all = monthTasks({ all: true });
  const tasks = all
    .filter((t) => !q || String(t.name || "").toLowerCase().includes(q))
    .slice()
    .sort((a, b) => String(a.line).localeCompare(String(b.line)) || String(a.name).localeCompare(String(b.name)));
  const year = String(state.month || "").slice(0, 4) || "2026";
  if (!all.length) {
    $("board").innerHTML = `<div class="sp-empty">No projects in ${escapeHtml(monthLabel(state.month))}.</div>`;
    return;
  }
  if (!tasks.length) {
    $("board").innerHTML = `<div class="sp-empty">No projects match.</div>`;
    return;
  }
  const sections = reportSections(tasks);
  const totalHours = sections.reduce((s, sec) => s + sec.hours, 0);
  const totalShifts = sections.reduce((s, sec) => s + sec.shifts, 0);
  const totalProjects = sections.reduce((s, sec) => s + sec.rows.length, 0);
  const body = sections
    .map((sec) => {
      const rows = sec.rows
        .map(
          (t) => `<tr class="sp-row">
            <td class="sp-name" title="${escapeHtml(t.name)}">${escapeHtml(t.name)}</td>
            <td class="sp-num">${fmtReportNum(t.shifts, 3)}</td>
            <td class="sp-num">${fmtReportNum(hoursOf(t), 1)}</td>
            <td></td>
          </tr>`
        )
        .join("");
      return `<tr class="sp-sec">
          <th>${escapeHtml(sec.label)}</th>
          <th></th>
          <th></th>
          <th class="sp-num">${fmtReportNum(sec.hours, 1)}</th>
        </tr>${rows}`;
    })
    .join("");
  $("board").innerHTML = `
    <section class="sp-report">
      <header class="sp-head">
        <h2>Hours report</h2>
        <p>Every task billed in ${escapeHtml(monthLabel(state.month))}. MGX and Playables on one list. PROJECT NAME / SHIFTS / HOURS — the same list the invoices are based on.</p>
      </header>
      <div class="sp-kpis">
        <div class="kpi"><b>${totalProjects}</b><span>projects</span></div>
        <div class="kpi"><b>${fmtReportNum(totalShifts, 1)}</b><span>shifts</span></div>
        <div class="kpi"><b>${fmtReportNum(totalHours, 1)} h</b><span>hours</span></div>
        ${hoursStampKpi()}
      </div>
      <div class="sp-sheet">
        <div class="sp-scroll">
          <table class="sp-table">
            <thead>
              <tr>
                <th class="sp-name">${escapeHtml(year)} PROJECT NAME</th>
                <th>SHIFTS</th>
                <th>HOURS</th>
                <th class="sp-sum-h"></th>
              </tr>
            </thead>
            <tbody>${body}</tbody>
            <tfoot>
              <tr class="sp-gap"><td colspan="4"></td></tr>
              <tr class="sp-total">
                <td>TOTAL</td>
                <td></td>
                <td class="sp-num">${fmtReportNum(totalHours, 1)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      <div class="sp-download">
        <button type="button" class="btn green" id="btnHoursXlsx">Download Excel</button>
      </div>
    </section>`;
  startHoursStamp();
  bindHoursDownload();
}

function renderExcelSheet() {
  const play = state.direction === "playables";
  const people = excelPeople();
  const q = searchQuery();
  const tasks = monthTasks()
    .filter((t) => !q || `${t.name} ${t.brief}`.toLowerCase().includes(q))
    .slice()
    .sort((a, b) => String(a.line).localeCompare(String(b.line)) || String(a.name).localeCompare(String(b.name)));
  const hoursOfPerson = (personId) =>
    tasks.reduce((s, t) => s + hoursForPerson(t, personId), 0);
  const allHours = tasks.reduce((s, t) => s + (Number(t.hours) || 0), 0);
  const allShifts = tasks.reduce((s, t) => s + (Number(t.shifts) || 0), 0);
  const nameHeads = people.map((p) => `<th class="xl-person">${escapeHtml(p.name)}</th>`).join("");
  const usedSeats = {};
  const emplHeads = people
    .map((p, i) => `<th>${play ? escapeHtml(excelSeatLabel(p, usedSeats)) : `EMPL ${i + 1}`}</th>`)
    .join("");

  const rowHtml = (t) => {
    const cells = people
      .map((p) => {
        const share = hoursForPerson(t, p.id);
        const mine = share > 0;
        const h = mine ? fmtHours(share) : "";
        const style = mine ? `style="background:${p.color || "#d8d8d8"}"` : "";
        return `<td class="${mine ? "xl-fill" : ""}" ${style}>${h}</td>`;
      })
      .join("");
    const mark = statusMark(t);
    const meta = play
      ? `<td class="xl-num">${fmtHours(t.hours)}</td>`
      : `<td class="xl-num">${t.shifts ?? ""}</td>
      <td class="xl-num">${fmtHours(t.hours)}</td>
      <td class="xl-num">${escapeHtml(excelDate(t.deadline))}</td>`;
    return `<tr class="xl-row${t.studioStatus === "closed" ? " is-closed" : ""}" data-id="${t.id}">
      <td class="xl-st st-${mark.cls}" title="${escapeHtml(mark.title)}">${escapeHtml(mark.label)}</td>
      <td class="xl-name" title="${escapeHtml(t.name)}">${escapeHtml(t.name)}</td>
      ${meta}
      ${cells}
    </tr>`;
  };

  const xlLabel = play ? "Playable" : "MGX";
  const section = (line) => {
    const rows = tasks.filter((t) => t.line === line);
    const metaHeads = play ? `<th>HOURS</th>` : `<th>SHIFTS</th><th>HOURS</th><th>DEADLINE</th>`;
    return `<tbody>
      <tr class="xl-sec">
        <th class="xl-line">${line}</th><th>${xlLabel}</th>${metaHeads}${emplHeads}
      </tr>
      ${rows.map(rowHtml).join("")}
    </tbody>`;
  };

  const totals = people.map((p) => `<td class="xl-num"><b>${fmtHours(hoursOfPerson(p.id))}</b></td>`).join("");
  const footMeta = play
    ? `<td class="xl-num"><b>${fmtHours(allHours)}</b></td>`
    : `<td class="xl-num"><b>${fmtHours(allShifts)}</b></td>
              <td class="xl-num"><b>${fmtHours(allHours)}</b></td>
              <td></td>`;
  const headPad = play ? `<th></th>` : `<th></th><th></th><th></th>`;

  $("board").innerHTML = `
    <section class="xl-wrap">
      <div class="xl-scroll">
        <table class="xl-table">
          <thead>
            <tr>
              <th class="xl-st-h"></th>
              <th class="xl-proj-h">${state.month.slice(0, 4)} PROJECT NAME</th>
              ${headPad}
              ${nameHeads}
            </tr>
          </thead>
          ${section("DX")}
          ${section("DD")}
          ${tasks.some((t) => t.line === "DS") ? section("DS") : ""}
          <tfoot>
            <tr>
              <td></td>
              <td>total</td>
              ${footMeta}
              ${totals}
            </tr>
          </tfoot>
        </table>
      </div>
    </section>`;

  $("board").querySelectorAll(".xl-row").forEach((row) => {
    row.addEventListener("click", () => {
      const t = state.db.tasks.find((x) => x.id === row.dataset.id);
      if (!t) return;
      if (isPerformer() && !onMyPlayable(t) && t.assigneeId !== me().id && !helpedOn(t, me().id)) {
        toast("Open your own projects from My projects");
        return;
      }
      openTask(t.id);
    });
  });
}

function excelIngestNote(out, n, folders) {
  const src = out.fromDrive ? "Drive Excel" : "Excel";
  const sheet = out.sheet ? ` ${out.sheet}` : "";
  if (n) {
    let note = `${src}${sheet}: ${n} new`;
    if (folders) note += ` · ${folders} Drive folder${folders === 1 ? "" : "s"} + brief`;
    if (out.drive?.errors?.length) note += ` · ${out.drive.errors[0].error || out.drive.errors[0]}`;
    return note;
  }
  const last = (out.lastNames || []).filter(Boolean).slice(-2).join(" · ");
  return `${src}${sheet}: ${out.parsed || 0} rows, 0 new${last ? ` · last ${last}` : ""}`;
}
async function pullExcel() {
  const out = await api("/api/excel/pull", { month: state.month });
  if (out.busy) {
    toast("Already reading Excel…");
    return;
  }
  if (out.error && !out.state) {
    toast(out.error);
    return;
  }
  if (!out.state) {
    toast(out.error || "Could not read SP_MGX_check");
    return;
  }
  applyState(out.state);
  const n = Number(out.added || 0);
  const folders = Number(out.drive?.created || 0);
  toast(excelIngestNote(out, n, folders));
}

function ui(name) {
  return `<b class="ui">${escapeHtml(name)}</b>`;
}
function renderGuide() {
  const role = me()?.role;
  const card = (id, badge, title, who, steps) => `
    <article class="guide-card${role === id ? " is-you" : ""}">
      <header>
        <span class="job-badge job-${escapeHtml(badge.toLowerCase())}">${escapeHtml(badge)}</span>
        <div>
          <h3>${escapeHtml(title)}</h3>
          <p>${escapeHtml(who)}</p>
        </div>
        ${role === id ? `<em>Ти зараз тут</em>` : ""}
      </header>
      <ol>${steps.map((s) => `<li>${s}</li>`).join("")}</ol>
    </article>`;
  const chip = (cls, label) => `<span class="notice-chip notice-${cls}">${label}</span>`;
  const statusCard = (cls, short, full, who, meaning) => `
    <article class="guide-status">
      ${chip(cls, short)}
      <strong>${escapeHtml(full)}</strong>
      <p>${meaning}</p>
      <small>${who}</small>
    </article>`;
  const pipeStep = (n, badge, who, title, body, cls, short) => `
    <li class="guide-pipe-step">
      <span class="guide-pipe-n">${n}</span>
      <div class="guide-pipe-body">
        <header>
          <span class="job-badge job-${escapeHtml(badge.toLowerCase())}">${escapeHtml(badge)}</span>
          <b>${escapeHtml(who)}</b>
          <span>${escapeHtml(title)}</span>
        </header>
        <p>${body}</p>
      </div>
      <div class="guide-pipe-out">
        <small>статус стає</small>
        ${chip(cls, short)}
      </div>
    </li>`;
  $("board").innerHTML = `
    <section class="guide">
      <div class="guide-intro">
        <h2>Як працює LG Board</h2>
        <p>Monday лишається у клієнта. Тут — черга студії, години і здача. Чіп біля назви — статус проєкту. ${ui("Send to client")} — кнопка LP, не бейдж. Підписи кнопок англійською — як на екрані.</p>
      </div>
      <div class="guide-block">
        <h3>Статуси</h3>
        <p class="guide-lead">Один чіп на проєкт. Читай зверху вниз: що означає і хто з ним працює.</p>
        <div class="guide-status-grid">
          ${statusCard("ready", "Ready", "Ready to Start", "Хто: LP створює, TL назначає", "Таск щойно створили. Після призначення людини статус лишається Ready — WIP ставить сам MD.")}
          ${statusCard("wip", "WIP", "WIP", "Хто: MD", "Виконавець почав роботу. Файл ще не зданий.")}
          ${statusCard("fix", "Fix", "Need Fixing", "Хто: MD править", "Клієнт або LP відбили. Не TL Check — треба правка, потім знову здати.")}
          ${statusCard("tlcheck", "TL chk", "TL Check", "Хто: MD здав, далі TL", "Лінк результату в картці. MD не ставить Done. TL перевіряє і лише тоді Done.")}
          ${statusCard("done", "Done", "Done", "Хто: TL перевірив, далі LP", "Team Lead прийняв роботу. LP може Send to client або одразу Closed.")}
          ${statusCard("appr", "Appr.", "Senior Approval", "Хто: чекаємо клієнта", "LP натиснув Send to client. Текст для Monday скопійовано. Ще не Closed.")}
          ${statusCard("closed", "Closed", "Closed", "Хто: LP після відповіді клієнта", "Клієнт прийняв. Години лишаються, роботи більше немає.")}
        </div>
      </div>
      <div class="guide-block">
        <h3>Пайплайн</h3>
        <p class="guide-lead">П’ять кроків підряд. Кожен крок змінює чіп справа.</p>
        <ol class="guide-pipe">
          ${pipeStep("1", "LP", "Line Producer", "Таск заходить", `${ui("Create task")} або ${ui("Shift email")}. Статус одразу ${ui("Ready to Start")}.`, "ready", "Ready")}
          ${pipeStep("2", "TL", "Team Lead", "Ставить виконавця", `${ui("Who works this")} → ${ui("Save")}. Статус лишається Ready.`, "ready", "Ready")}
          ${pipeStep("3", "MD", "Motion design", "Починає і здає", `${ui("WIP")}, коли почав. Потім лінк результату і ${ui("TL Check")}. Не ${ui("Done")}.`, "tlcheck", "TL chk")}
          ${pipeStep("4", "TL", "Team Lead", "Перевіряє", `Після ${ui("TL Check")} TL ставить ${ui("Done")}.`, "done", "Done")}
          ${pipeStep("5", "LP", "Line Producer", "Відправляє клієнту", `${ui("Send to client")} лише з ${ui("Done")} + лінк. Це ${ui("Appr.")}.`, "appr", "Appr.")}
          ${pipeStep("6", "LP", "Line Producer", "Клієнт прийняв", `${ui("Closed")} з ${ui("Done")} або після ${ui("Send")}. Якщо відбили — ${ui("Need Fixing")}, MD знову ${ui("TL Check")}.`, "closed", "Closed")}
        </ol>
      </div>
      <div class="guide-grid">
        ${card("manager", "LP", "Line Producer", "Анастасія. Бачить усе.", [
          `Новий пак: ${ui("Create task")} (тека + бриф на Drive) або ${ui("Shift email")} (NAME 0.3 shift — тире, пробіл або |).`,
          `Бриф на картці пишеться в Google Doc. ${ui("Client notes")} одразу під ним: встав текст і скрін (Ctrl+V) з Monday.`,
          `Години: ${ui("Shifts")} у рядку або в картці. 1 shift = 9 годин. Виконавця ставить TL.`,
          `Рядок фарбується за статусом. Чіп: ${ui("Ready")} / ${ui("WIP")} / ${ui("Fix")} / ${ui("Done")} / ${ui("Appr.")} / ${ui("Closed")}. Не ${ui("Send")}.`,
          `${ui("Excel")} — години як у файлі. Чіп зліва той самий, що в пайплайні, не лише WIP/Closed. ${ui("Due")} = ${ui("DEADLINE")}.`,
          `${ui("Send to client")} лише з ${ui("Done")} + лінк файлу. Копіює текст у External Weekly. ${ui("Appr.")} сам не ставиться.`,
          `${ui("Mark Closed")} коли клієнт прийняв — можна без ${ui("Send")}. Темно-зелений штамп, білий напис — не той самий колір, що ${ui("Done")}. Якщо відбили — ${ui("Need Fixing")}.`,
          `${ui("Hours split")} на картці: клієнтські години не ростуть. 0.5h тому, хто відрендерив замість колеги. Who лишається власником ${ui("Done")}.`,
        ])}
        ${card("teamlead", "TL", "Team Lead", "Настя. Усі проєкти + свої як виконавця.", [
          `Дзвіночок ${ui("New")} — нові без людини. Картка каже ${ui("Assign a designer")} — це твоя робота, не URL і не Done.`,
          `Прочитай бриф, ${ui("Open brief")} якщо треба Doc. ${ui("Who works this")} → ${ui("Save")}. Людина одразу бачить таск у себе.`,
          `Свої таски — як MD: ${ui("Paste result link here")}, потім ${ui("Done")}.`,
          `${ui("Hours split")} — якщо хтось відрендерив чужий файл, постав 0.5h (або скільки чесно). Клієнту години ті самі.`,
          `${ui("Excel")} — години як у ${ui("SP_MGX_check")}. Чіп зліва той самий, що в пайплайні: ${ui("WIP")} / ${ui("Fix")} / ${ui("Done")} / ${ui("Appr.")} / ${ui("Closed")}. ${ui("Send to client")} і ${ui("Closed")} у TL немає — це LP.`,
        ])}
        ${card("designer", "MD", "Motion design", "Марія, Сергій, Аліна, Олекса. Лише свої таски.", [
          `Дзвіночок ${ui("On you")} — тебе поставили. ${ui("Fix")} — ${ui("Need Fixing")}.`,
          `Картка: ${ui("Brief")} → ${ui("Client notes")} (якщо клієнт написав) → ${ui("Source")} → ${ui("Result")}. Бриф не міняється.`,
          `Зробив → ${ui("Paste result link here")} (лінк на файл, не на теку). Поки лінка немає, ${ui("Done")} у статусі немає.`,
          `Потім ${ui("Done")} → ${ui("Save")}. Далі чекає LP. ${ui("Appr.")} — уже в клієнта. ${ui("Closed")} — прийнято, нічого не робити.`,
          `Якщо відрендерив чужий таск — TL/LP ставить тобі години в ${ui("Hours split")}. Таск з’явиться в твоїй черзі як help, ${ui("Done")} лишається в Who.`,
        ])}
        ${card(
          "client",
          "SP",
          "SuperPlay",
          "Клієнт. Своя сторінка годин, без черги студії.",
          [
            `Адреса студії ${ui("board.lisenbart.games")}. Кнопка ${ui("Client")} → логін + PIN. Після входу — лише ${ui("Hours")}.`,
            `Можна кинути пряме посилання ${ui("/hours")}. Список як у інвойсі: ${ui("PROJECT NAME")} / ${ui("SHIFTS")} / ${ui("HOURS")}.`,
            `Секції ${ui("MGX")} і ${ui("Playable")} (DX / DD / DS), ${ui("TOTAL")} знизу. Імен виконавців, ставок і карток немає.`,
          ]
        )}
      </div>
      <div class="guide-notes">
        <div>
          <h3>Дзвіночок</h3>
          <p>${ui("New")} нові · ${ui("On you")} тебе поставили · ${ui("Fix")} правки · ${ui("Send")} час клієнту (це inbox LP, не чіп рядка). Відкрив картку — позначка зникла. Telegram пізніше, якщо треба пінг коли немає світла.</p>
        </div>
        <div>
          <h3>Excel</h3>
          <p>Місяць як ${ui("SP_MGX_check")}. Зліва жирні ${ui("DX")} / ${ui("DD")}, у тій клітинці чіп проєкту: ${ui("Ready")} / ${ui("WIP")} / ${ui("Fix")} / ${ui("Done")} / ${ui("Appr.")} / ${ui("Closed")}. ${ui("DEADLINE")} у файлі = ${ui("Due")} на пайплайні. ${ui("Send")} там немає.</p>
        </div>
        <div>
          <h3>Правила</h3>
          <ol>
            <li>${ui("Done")} без вставленого лінка на результат — неможливо.</li>
            <li>${ui("Send to client")} лише з ${ui("Done")}. Не з ${ui("Ready")} і не з ${ui("WIP")}.</li>
            <li>${ui("Appr.")} ставить тільки ${ui("Send to client")}, не руками зі списку.</li>
            <li>${ui("Closed")} ставить LP після ${ui("Appr.")}, коли клієнт прийняв. Не з ${ui("Done")} і не замість Send.</li>
          </ol>
        </div>
      </div>
    </section>`;
}

function renderBoard() {
  if (state.view === "close") {
    renderClose();
    return;
  }
  if (state.view === "team") {
    renderTeam();
    return;
  }
  if (state.view === "excel") {
    renderExcelSheet();
    return;
  }
  if (state.view === "guide") {
    renderGuide();
    return;
  }
  if (state.view === "report") {
    renderClientReport();
    return;
  }
  const exec = isExecView();
  let tasks = visibleTasks();
  if (state.view === "ready") tasks = tasks.filter((t) => t.studioStatus === "done");
  tasks = sortedTasks(tasks);
  const mode = exec ? "exec" : "ops";
  const frozenHead =
    mode === "ops"
      ? `<div class="frozen"><div class="cell">Line</div><div class="cell"></div><div class="cell">Project</div></div>`
      : `<div class="frozen"><div class="cell">Line</div><div class="cell">Project</div></div>`;
  const head = `<div class="cols ${mode}">
      ${frozenHead}
      <div class="meta">
        <div class="cell">Time</div>
        <div class="cell">Status</div>
        <div class="cell">Brief</div>
        <div class="cell">Result</div>
        <div class="cell">Who</div>
        <div class="cell">Due</div>
      </div>
    </div>`;

  $("board").innerHTML = `
    <section class="group sheet" style="--name-width:${savedNameWidth()}px">
      <div class="col-splitter" title="Drag to move columns" role="separator" aria-orientation="vertical"></div>
      ${head}
      ${
        tasks.length
          ? tasks
              .map((t, i) => {
                const prev = tasks[i - 1];
                const gap = prev && prev.studioStatus !== t.studioStatus;
                return rowHtml(t, mode, gap);
              })
              .join("")
          : `<div class="cell empty" style="padding:12px 16px">${
              isPerformer()
                ? `Nothing assigned in ${monthLabel(state.month)}`
                : state.designerFilter === "done"
                  ? `No ${state.direction === "playables" ? "HTML ready" : "Done"} projects in ${monthLabel(state.month)}`
                  : `No projects in ${monthLabel(state.month)}`
            }</div>`
      }
    </section>`;

  $("board").querySelectorAll(".row").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.closest("input,select,a,button,.col-splitter")) return;
      openTask(el.dataset.id);
    });
  });
  $("board").querySelectorAll(".chk").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = el.dataset.id;
      if (el.checked) state.selected.add(id);
      else state.selected.delete(id);
      el.closest(".row")?.classList.toggle("selected", el.checked);
      renderToolbar();
    });
  });
  bindSplitter($("board").querySelector(".group"));
  bindTimeEdits();
}

function bindTimeEdits() {
  $("board").querySelectorAll(".shift-in").forEach((el) => {
    const commit = () => {
      const t = state.db.tasks.find((x) => x.id === el.dataset.id);
      if (!t) return;
      const shifts = parseShifts(el.value);
      if (shifts === null) {
        el.value = t.shifts ?? "";
        toast("Shifts must be 0 or more");
        return;
      }
      if (shifts === Number(t.shifts)) return;
      const hours = hoursFromShifts(shifts);
      const hint = el.parentElement?.querySelector("small");
      if (hint) hint.textContent = hours ? hours + "h" : "—";
      updateTask(t.id, {
        shifts,
        role: me().role,
        note: `${me().name} set ${shifts} shifts → ${hours} h`,
      });
    };
    el.addEventListener("click", (e) => e.stopPropagation());
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        el.blur();
      }
    });
    el.addEventListener("change", commit);
  });
  $("board").querySelectorAll(".hours-in").forEach((el) => {
    const commit = () => {
      const t = state.db.tasks.find((x) => x.id === el.dataset.id);
      if (!t) return;
      const hours = parseShifts(el.value);
      if (hours === null) {
        el.value = t.hours ?? "";
        toast("Hours must be 0 or more");
        return;
      }
      if (hours === Number(t.hours)) return;
      updateTask(t.id, {
        hours,
        role: me().role,
        note: `${me().name} set ${hours} billed hours`,
      });
    };
    el.addEventListener("click", (e) => e.stopPropagation());
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        el.blur();
      }
    });
    el.addEventListener("change", commit);
  });
}

function statusMark(t) {
  const key = t.studioStatus || "new";
  const title = (STATUS[key] || STATUS.new).label;
  return (
    {
      new: { cls: "ready", label: "Ready", title },
      wip: { cls: "wip", label: "WIP", title },
      revision: { cls: "fix", label: "Fix", title },
      tlcheck: { cls: "tlcheck", label: "TL chk", title },
      done: { cls: "done", label: "Done", title },
      approve: { cls: isPlayables(t) ? "send" : "appr", label: isPlayables(t) ? "Send" : "Appr.", title },
      closed: { cls: "closed", label: "Closed", title },
      storyboard: { cls: "board", label: "Board", title },
      clientart: { cls: "art", label: "Art", title },
      finalart: { cls: "final", label: "Final", title },
      build: { cls: "build", label: "Build", title },
      htmlready: { cls: "html", label: "HTML", title },
    }[key] || { cls: "ready", label: "Ready", title: STATUS.new.label }
  );
}
function excelStatus(t) {
  return statusMark(t);
}
function statusChip(t) {
  const spec = statusMark(t);
  return `<span class="notice-chip notice-${spec.cls}">${spec.label}</span>`;
}
function rowHtml(t, mode, gap) {
  const st = STATUS[t.studioStatus] || STATUS.new;
  const sendable = isSendable(t);
  const checked = sendable && state.selected.has(t.id) ? "checked" : "";
  const gapCls = gap ? " status-gap" : "";
  const brief = t.docUrl
    ? `<a class="linkish" href="${escapeHtml(t.docUrl)}" target="_blank" rel="noreferrer">Brief</a>`
    : t.brief
      ? `<span class="linkish">text</span>`
      : `<span class="empty">none</span>`;
  const result = t.resultUrl
    ? `<a class="linkish" href="${escapeHtml(t.resultUrl)}" target="_blank" rel="noreferrer">Link</a>`
    : `<span class="empty">paste</span>`;
  const pick =
    mode === "ops"
      ? sendable
        ? `<input class="chk" data-id="${t.id}" type="checkbox" ${checked} />`
        : ""
      : "";
  const chip = statusChip(t);
  const frozen =
    mode === "ops"
      ? `<div class="frozen">
          <div class="cell"><span class="pill line-${t.line}">${t.line}</span></div>
          <div class="cell">${pick}</div>
          <div class="cell name" title="${escapeHtml(t.name)}">${chip}<span class="name-text">${escapeHtml(t.name)}</span></div>
        </div>`
      : `<div class="frozen">
          <div class="cell"><span class="pill line-${t.line}">${t.line}</span></div>
          <div class="cell name" title="${escapeHtml(t.name)}">${chip}${escapeHtml(t.name)}</div>
        </div>`;
  return `
    <div class="row ${mode} tone-${escapeHtml(t.studioStatus || "new")}${gapCls} ${checked ? "selected" : ""}" data-id="${t.id}">
      ${frozen}
      <div class="meta">
        <div class="cell">${timeCell(t)}</div>
        <div class="cell"><span class="pill ${st.cls}">${st.label}</span></div>
        <div class="cell">${brief}</div>
        <div class="cell">${result}</div>
        <div class="cell">${whoCell(t)}</div>
        <div class="cell">${dueCell(t)}</div>
      </div>
    </div>`;
}

function statusChoices(task) {
  return statusActions(task);
}

function statusActions(task) {
  const role = me().role;
  const cur = task?.studioStatus || "new";
  if (isPlayables(task)) {
    const mine =
      String(task?.assigneeId || "") === String(me().id) ||
      String(task?.programmerId || "") === String(me().id) ||
      helpedOn(task, me().id);
    if (role === "art_director" || role === "programmer" || role === "designer") {
      if (!mine || ["approve", "closed"].includes(cur)) return [];
      return (PLAY_STATUS_BY_ROLE[role] || []).filter((k) => k !== cur);
    }
    if (role === "manager" || role === "finance") {
      const out = [];
      if (cur === "clientart") out.push("storyboard");
      if (cur !== "closed") out.push("closed");
      return out;
    }
    if (role === "teamlead") return (PLAY_STATUS_BY_ROLE.teamlead || []).filter((k) => k !== cur);
    return [];
  }
  const mine = String(task?.assigneeId || "") === String(me().id);
  if (role === "designer") {
    if (!mine || ["done", "approve", "closed"].includes(cur)) return [];
    const out = [];
    if (cur !== "wip") out.push("wip");
    if (cur !== "tlcheck") out.push("tlcheck");
    return out;
  }
  if (role === "teamlead") {
    const out = [];
    if (mine && !["done", "approve", "closed"].includes(cur)) {
      if (cur !== "wip") out.push("wip");
      if (cur !== "tlcheck") out.push("tlcheck");
    }
    if (cur === "tlcheck") out.push("done");
    return out;
  }
  if (role === "manager" || role === "finance") {
    const out = [];
    if (["wip", "tlcheck", "done", "approve"].includes(cur)) out.push("revision");
    if (cur !== "closed") out.push("closed");
    return out;
  }
  return [];
}

function statusButtonDisabled(task, key, opts) {
  const on = (task.studioStatus || "new") === key;
  if (opts.locked) return true;
  if (!opts.canEdit) return true;
  if (on) return true;
  if (isPlayables(task)) {
    if (key === "htmlready" && !hasResultLink(task, opts.typedResult)) return true;
    return !canSetStatus(key, task);
  }
  if (key === "tlcheck" && !hasResultLink(task, opts.typedResult)) return true;
  if (key === "done" && task.studioStatus !== "tlcheck") return true;
  return !canSetStatus(key, task);
}

function statusButtonsHtml(t, canEdit, lockedStatus) {
  const current = t.studioStatus || "new";
  const opts = { canEdit, locked: lockedStatus };
  const keys = statusActions(t);
  if (!keys.length) {
    return `<input type="hidden" id="stStatus" value="${escapeHtml(current)}" />
    <p class="status-hint" id="stDoneHint"></p>`;
  }
  const buttons = keys.map((key) => {
    const mark = statusMark({ studioStatus: key, department: t.department, direction: t.direction });
    const on = current === key;
    const disabled = statusButtonDisabled(t, key, opts);
    const label = (STATUS[key] && isPlayables(t) && key === "approve" ? "Send" : STATUS[key]?.label) || key;
    return `<button type="button" class="status-btn st-${mark.cls} ${on ? "is-on" : "is-off"}" data-status="${key}" aria-pressed="${on ? "true" : "false"}" ${disabled ? "disabled" : ""} title="${escapeHtml(label)}">${escapeHtml(label)}</button>`;
  }).join("");
  return `<div class="status-btns" role="group" aria-label="Status">${buttons}</div>
    <input type="hidden" id="stStatus" value="${escapeHtml(current)}" />
    <p class="status-hint" id="stDoneHint"></p>`;
}

function paintStatusButtons(key) {
  const input = $("stStatus");
  if (input) input.value = key;
  $("drawer")
    ?.querySelectorAll(".status-btn")
    .forEach((btn) => {
      const on = btn.dataset.status === key;
      btn.classList.toggle("is-on", on);
      btn.classList.toggle("is-off", !on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  const pill = $("stMetaStatus");
  if (pill && STATUS[key]) {
    pill.className = `pill ${STATUS[key].cls}`;
    pill.textContent = STATUS[key].label;
  }
}

function canSetStatus(next, task) {
  const t = task || state.db?.tasks?.find((x) => x.id === state.openId);
  if (t && isPlayables(t)) return (PLAY_STATUS_BY_ROLE[me().role] || []).includes(next);
  return (STATUS_BY_ROLE[me().role] || []).includes(next);
}

function hasResultLink(task, typedResult) {
  const typed =
    typedResult !== undefined ? String(typedResult || "").trim() : "";
  const saved = String(task?.resultUrl || "").trim();
  return Boolean(typed || saved);
}

function savedNameWidth() {
  const n = Number(localStorage.getItem(NAME_WIDTH_KEY));
  if (!Number.isFinite(n)) return NAME_WIDTH_DEFAULT;
  const w = n === 520 ? NAME_WIDTH_DEFAULT : n;
  return w >= NAME_WIDTH_MIN ? w : NAME_WIDTH_DEFAULT;
}

function nameWidthMax(group) {
  const board = group?.closest(".board");
  const visible = board?.clientWidth || group?.clientWidth || 0;
  return Math.max(NAME_WIDTH_MIN, visible - 280);
}

function applyNameWidth(group, px) {
  if (!group) return;
  const max = nameWidthMax(group);
  const w = Math.round(Math.min(Math.max(NAME_WIDTH_MIN, px), max));
  group.style.setProperty("--name-width", `${w}px`);
  localStorage.setItem(NAME_WIDTH_KEY, String(w));
}

function bindSplitter(group) {
  const handle = group?.querySelector(":scope > .col-splitter");
  if (!handle) return;
  handle.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    handle.setPointerCapture(e.pointerId);
    group.classList.add("is-resizing");
    document.body.classList.add("col-resizing");
    const startX = e.clientX;
    const startLeft = group.getBoundingClientRect().left;
    const startW = parseFloat(getComputedStyle(group).getPropertyValue("--name-width")) || NAME_WIDTH_DEFAULT;
    const onMove = (ev) => {
      const shift = group.getBoundingClientRect().left - startLeft;
      applyNameWidth(group, startW + (ev.clientX - startX) - shift);
    };
    const onUp = () => {
      group.classList.remove("is-resizing");
      document.body.classList.remove("col-resizing");
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  });
  handle.addEventListener("dblclick", () => applyNameWidth(group, NAME_WIDTH_DEFAULT));
}

function ensureExcelHours() {
  state.excelMonth = state.month;
}

function financeFromApi(snap) {
  const fx = Number(snap.nbu?.rate) || nbuRate();
  const payroll = (snap.payroll || []).map((row) => {
    const p = person(row.id) || {
      id: row.id,
      name: row.name,
      role: row.role,
      legalName: row.legalName,
      jobTitle: row.jobTitle,
      bankCard: row.bankCard,
      iban: row.iban,
      payOrder: row.payOrder,
      rateUsd: row.rate,
    };
    return {
      person: p,
      projects: row.projects,
      shifts: row.shifts,
      hours: row.hours,
      hoursMgx: row.hoursMgx,
      hoursPlay: row.hoursPlay,
      allHours: row.allHours,
      rate: row.rate,
      rateMgx: row.rateMgx,
      ratePlay: row.ratePlay,
      payUsd: row.payUsd,
      payUsdMgx: row.payUsdMgx,
      payUsdPlay: row.payUsdPlay,
      payUah: row.payUah,
    };
  });
  const un = snap.unassigned || {};
  return {
    month: monthLabel(snap.month || state.month),
    ym: snap.month || state.month,
    tasks: { length: snap.projects || 0 },
    totalHours: snap.hours,
    totalShifts: snap.shifts,
    byLine: snap.byLine || [],
    payroll,
    unassignedHours: un.hours || 0,
    unassignedShifts: un.shifts || 0,
    unassignedProjects: un.projects || 0,
    clientIn: snap.clientIn,
    afterTax: snap.afterTax,
    empl: snap.empl,
    studio: snap.studio,
    clientInUah: snap.clientInUah,
    afterTaxUah: snap.afterTaxUah,
    emplUah: snap.emplUah,
    studioUah: snap.studioUah,
    fx,
    tax: snap.taxPct,
    clientRate: snap.clientRate,
    playableClientRate: snap.playableClientRate,
    byDirection: snap.byDirection || [],
    hoursSource: snap.hoursSource,
    nbu: snap.nbu,
  };
}

function ensureDriveStatus() {
  if (!isFinance() || !isStudioHost()) return;
  if (state.drive || state.driveLoading) return;
  state.driveLoading = true;
  fetch("/api/drive/status", { credentials: "same-origin" })
    .then((r) => r.json())
    .then((out) => {
      state.driveLoading = false;
      if (out && !out.error) state.drive = out;
      if (isFinance()) render();
    })
    .catch(() => {
      state.driveLoading = false;
    });
}

async function pullDrive() {
  const out = await api("/api/drive/pull", {});
  if (out.error) {
    toast(out.error);
    return;
  }
  if (out.drive) state.drive = out.drive;
  if (out.state) applyState(out.state);
  const names = (out.downloaded || []).join(", ") || "Drive files";
  const briefs = Number(out.briefs || 0);
  const added = Number(out.added || 0);
  const folders = Number(out.packs?.created || 0);
  let note = briefs
    ? `Drive files · ${names} · ${briefs} brief${briefs === 1 ? "" : "s"} from October folders`
    : `Drive files · ${names}`;
  if (added) note += ` · ${added} new`;
  if (folders) note += ` · ${folders} folder${folders === 1 ? "" : "s"} + brief`;
  toast(note);
  render();
}

function drivePack() {
  const d = state.drive || {};
  const meta = state.db?.meta || {};
  return {
    connected: d.connected || Boolean(state.driveAccessToken),
    hasClient: d.hasClient,
    clientId: d.clientId || "",
    hasSecret: d.hasSecret,
    pulledAt: d.pulledAt || meta.drivePulledAt || "",
    docs: d.docs || meta.driveDocs || "",
    excel: d.excel || meta.driveLiveExcel || "",
    calculator: d.calculator || meta.driveCalculator || "",
    october: d.october || meta.driveLiveOctober || "",
    octoberDDId: d.octoberDDId || "",
    octoberDXId: d.octoberDXId || "",
    invoices: d.invoices || meta.driveMgxInvoices || meta.driveInvoiceMgx || "",
  };
}

function driveStrip() {
  const d = drivePack();
  const links = [
    ["docs", d.docs],
    ["Excel", d.excel],
    ["CALC", d.calculator],
    ["October", d.october],
    ["Invoices", d.invoices],
  ]
    .filter((row) => row[1])
    .map(
      ([label, href]) =>
        `<a class="drive-link" href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`
    )
    .join("");
  const build = document.documentElement.dataset.build || "";
  const watch = state.db?.meta?.excelWatch || {};
  const watchBits = [];
  if (watch.parsed) {
    const match = Number(watch.matched || 0);
    watchBits.push(
      match && match !== Number(watch.parsed)
        ? `${match}/${watch.parsed} Excel rows on board`
        : `${watch.parsed} Excel rows`
    );
  }
  const last = (watch.lastNames || watch.fresh || []).filter(Boolean).slice(-1)[0];
  if (last) watchBits.push(last);
  if (watch.error) watchBits.push(String(watch.error));
  else if (watch.fromDrive) watchBits.push("from Drive");
  const status = d.connected
    ? `Live disk${d.pulledAt ? ` · ${escapeHtml(String(d.pulledAt).replace("T", " ").replace("Z", ""))}` : ""}`
    : "Live disk · Create task writes October DD / DX";
  const extra = watchBits.length ? ` · ${watchBits.join(" · ")}` : "";
  return `<div class="drive-strip">
    <div>
      <strong>Google Drive</strong>
      <p>${escapeHtml(status)}${extra ? escapeHtml(extra) : ""}${build ? ` · desk ${escapeHtml(build)}` : ""}</p>
      <div class="drive-links">${links}</div>
    </div>
    <div class="drive-actions">
      <button type="button" class="btn" id="btnDrivePull">Refresh files</button>
    </div>
  </div>`;
}

function ensureFinanceSnapshot() {
  if (state.finApiMonth === state.month && state.finApi) return;
  if (state.finApiLoading === state.month) return;
  state.finApiLoading = state.month;
  fetch(`/api/finance/snapshot?month=${encodeURIComponent(state.month)}`)
    .then((r) => r.json())
    .then((snap) => {
      state.finApiLoading = null;
      if (snap.error) {
        state.finApiMonth = null;
        toast(snap.error);
        return;
      }
      state.finApi = snap;
      state.finApiMonth = state.month;
      if (state.view === "close") render();
    })
    .catch(() => {
      state.finApiLoading = null;
      state.finApiMonth = null;
    });
}

function renderClose() {
  if (!isFinance()) {
    state.view = "board";
    render();
    return;
  }
  ensureNbu();
  ensureExcelHours();
  ensureFinanceSnapshot();
  ensureDriveStatus();
  const fin =
    state.finApi && state.finApiMonth === state.month ? financeFromApi(state.finApi) : financeSnapshot();
  const tabs = [
    { id: "client", label: "Client" },
    { id: "studio", label: "Studio" },
    { id: "employees", label: "Employeers" },
  ];
  const pane =
    state.finTab === "employees" ? renderEmployees(fin) : state.finTab === "studio" ? renderStudio(fin) : renderClient(fin);
  const tabBar = `<div class="fin-tabs" role="tablist">${tabs
    .map(
      (t) =>
        `<button type="button" class="fin-tab ${state.finTab === t.id ? "active" : ""}" data-tab="${t.id}" role="tab" aria-selected="${state.finTab === t.id ? "true" : "false"}">${t.label}</button>`
    )
    .join("")}</div>`;
  $("board").innerHTML = `<section class="fin">${driveStrip()}${tabBar}${pane}</section>`;
  $("board").querySelectorAll(".fin-tab").forEach((el) => {
    el.addEventListener("click", () => {
      state.finTab = el.dataset.tab;
      render();
    });
  });
  bindDriveButtons();
  $("btnCreateInvoices")?.addEventListener("click", createMonthInvoices);
  if (state.finTab === "employees") bindEmployeePay();
  if (state.finTab === "studio") bindStudioPay();
  $("btnOpenFolder")?.addEventListener("click", () => openInvoiceFolder("mgx"));
  $("btnOpenFolderPlay")?.addEventListener("click", () => openInvoiceFolder("playables"));
  $("board").querySelectorAll(".fin-copy").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      const copy = payCopyFromRow(btn.closest("tr"));
      const ok = copy ? await copyText(copy.value) : false;
      toast(ok ? "Copied" : "Could not copy");
    });
  });
}

function renderClient(fin) {
  const empty = !fin.tasks.length;
  const lineRows = fin.byLine
    .map((row) => {
      const share = fin.totalHours ? Math.round((row.hours / fin.totalHours) * 100) : 0;
      const rate = Number(row.rate) || (row.direction === "playables" ? fin.playableClientRate || 40 : fin.clientRate);
      const label = row.label || `${row.direction === "playables" ? "Playable" : "MGX"} ${row.line}`;
      return `<tr>
        <td><span class="pill ${row.direction === "playables" ? "dep-playables" : "dep-MGX"}">${escapeHtml(label)}</span></td>
        <td class="num">${row.projects}</td>
        <td class="num">${Number(row.shifts || 0).toFixed(1)}</td>
        <td class="num">${hoursLabel(row.hours)}</td>
        <td class="num">${usd(rate)}</td>
        <td class="num"><b>${usd(row.bill)}</b></td>
        <td class="num muted">${share}%</td>
        <td></td>
      </tr>`;
    })
    .join("");
  if (empty) {
    return `<div class="fin-empty">No hours in ${escapeHtml(fin.month)}.</div>`;
  }
  const canCreate = fin.byLine.some((row) => row.hours);
  return `
    <div class="fin-kpis">
      <div class="kpi"><b>${fin.tasks.length}</b><span>projects</span></div>
      <div class="kpi"><b>${hoursLabel(fin.totalHours)}</b><span>hours · MGX $35 / Playable $40</span></div>
      <div class="kpi"><b>${usd(fin.clientIn)}</b><span>CLIENT IN</span></div>
      <div class="kpi"><b>${usd(fin.studio)}</b><span>STUDIO</span></div>
    </div>
    <section class="group fin-card">
      <div class="fin-scroll">
        <table class="fin-table">
          <thead><tr><th>Line</th><th class="num">Projects</th><th class="num">Shifts</th><th class="num">Hours</th><th class="num">Rate</th><th class="num">CLIENT IN</th><th class="num">Share</th><th></th></tr></thead>
          <tbody>${lineRows}</tbody>
          <tfoot><tr>
            <td>SUPERPLAY</td>
            <td class="num">${fin.tasks.length}</td>
            <td class="num">${Number(fin.totalShifts || 0).toFixed(1)}</td>
            <td class="num">${hoursLabel(fin.totalHours)}</td>
            <td></td>
            <td class="num">${usd(fin.clientIn)}</td>
            <td></td>
            <td class="fin-foot-actions">
              <button type="button" class="btn" id="btnOpenFolder">Open MGX folder</button>
              <button type="button" class="btn" id="btnOpenFolderPlay">Open Playable folder</button>
              <button type="button" class="btn primary" id="btnCreateInvoices" ${canCreate ? "" : "disabled"}>Create invoices</button>
            </td>
          </tr></tfoot>
        </table>
      </div>
    </section>`;
}

function renderStudio(fin) {
  const pct = taxPercent(fin.tax);
  const rows = [
    { key: "clientIn", label: "CLIENT IN", usd: fin.clientIn },
    { key: "afterTax", label: "STUDIO (TAX)", usd: fin.afterTax },
    { key: "empl", label: "EMPL", usd: fin.empl },
    { key: "studio", label: "STUDIO", usd: fin.studio },
  ];
  const body = rows
    .map((row) => {
      const taxCtl =
        row.key === "afterTax"
          ? `<label class="fin-tax-line"><b>STUDIO (TAX)</b><input id="finTaxPct" class="fin-tax-in" type="number" min="0" max="100" step="0.1" value="${pct}" /><span>%</span></label>`
          : `<b>${escapeHtml(row.label)}</b>`;
      return `<tr class="${row.key === "studio" ? "fin-studio-row" : ""}" data-row="${row.key}">
        <td>${taxCtl}</td>
        <td class="num" data-uah-amt data-usd-amt="${row.usd}">${uah(row.usd * fin.fx)}</td>
        <td class="num" data-usd>${usd(row.usd)}</td>
      </tr>`;
    })
    .join("");
  const empty = !fin.tasks.length ? `<div class="fin-empty">No hours in ${escapeHtml(fin.month)}.</div>` : "";
  return `
    <section class="group fin-card">
      <div class="fin-rates">
        <label>NBU USD/UAH <input id="finNbu" type="number" min="0" step="0.01" value="${fin.fx}" /></label>
      </div>
      ${empty}
      <div class="fin-scroll">
        <table class="fin-table" id="finStudioTable" data-client-in="${fin.clientIn}" data-empl="${fin.empl}">
          <thead><tr><th></th><th class="num">UAH</th><th class="num">USD</th></tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    </section>`;
}

function studioTaxFraction() {
  const parsed = parseRate($("finTaxPct")?.value);
  if (parsed === null || parsed === false) return taxPct();
  return Math.min(parsed, 100) / 100;
}

function bindStudioPay() {
  $("finNbu")?.addEventListener("input", refreshStudioMoney);
  $("finNbu")?.addEventListener("change", () => saveNbuRate({ silent: true }));
  $("finTaxPct")?.addEventListener("input", refreshStudioMoney);
  $("finTaxPct")?.addEventListener("change", () => saveTaxPct({ silent: true }));
}

function refreshStudioMoney() {
  const root = $("board");
  const table = $("finStudioTable");
  if (!root || !table) return;
  const fx = employeePayFx();
  const tax = studioTaxFraction();
  const clientIn = Number(table.dataset.clientIn) || 0;
  const empl = Number(table.dataset.empl) || 0;
  const afterTax = clientIn - clientIn * tax;
  const studio = afterTax - empl;
  const amounts = { clientIn, afterTax, empl, studio };
  root.querySelectorAll("tr[data-row]").forEach((tr) => {
    const usdAmt = amounts[tr.dataset.row];
    const uahEl = tr.querySelector("[data-uah-amt]");
    const usdEl = tr.querySelector("[data-usd]");
    if (uahEl) {
      uahEl.dataset.usdAmt = String(usdAmt);
      uahEl.textContent = uah(usdAmt * fx);
    }
    if (usdEl) usdEl.textContent = usd(usdAmt);
  });
  for (const [key, val] of Object.entries(amounts)) {
    const el = root.querySelector(`[data-kpi="${key}"]`);
    if (el) el.textContent = usd(val);
  }
  const taxEl = root.querySelector("[data-kpi-tax]");
  if (taxEl) taxEl.textContent = String(taxPercent(tax));
}

async function saveTaxPct(opts = {}) {
  const parsed = parseRate($("finTaxPct")?.value);
  if (parsed === null || parsed === false || parsed > 100) {
    toast("Tax must be 0–100%");
    return;
  }
  const fraction = parsed / 100;
  const out = await api("/api/meta/update", {
    role: me().role,
    month: state.month,
    taxPct: fraction,
  });
  if (out.error || !out.state) {
    toast(out.error || "Could not save tax");
    return;
  }
  applyState(out.state);
  if (!opts.silent) toast(`Tax ${taxPercent(fraction)}%`);
}

function payCopy(row) {
  const card = normalizeCard(row.person.bankCard);
  if (card) return { label: formatCard(card), value: card, kind: "card" };
  const iban = normalizeIban(row.person.iban);
  if (iban) return { label: iban, value: iban, kind: "iban" };
  return null;
}

function payCopyFromRow(tr) {
  if (!tr) return null;
  const card = normalizeCard(tr.querySelector(".fin-card-input")?.value);
  if (card) return { label: formatCard(card), value: card, kind: "card" };
  const iban = normalizeIban(tr.querySelector(".fin-iban-input")?.value);
  if (iban) return { label: iban, value: iban, kind: "iban" };
  return null;
}

function refreshPayCopyButton(tr) {
  const btn = tr?.querySelector(".fin-copy");
  if (!btn) return;
  const copy = payCopyFromRow(tr);
  btn.disabled = !copy;
  btn.textContent = copy ? `Copy ${copy.kind}` : "Copy";
}

function employeeDirHours(row, dir) {
  return Number(dir === "playables" ? row.hoursPlay : row.hoursMgx) || 0;
}
function employeeDirRate(row, dir) {
  const named = Number(dir === "playables" ? row.ratePlay : row.rateMgx);
  if (Number.isFinite(named) && named >= 0) return named;
  return Number(row.rate) || rolePayRate(row.person);
}
function employeeInDirection(row, dir) {
  const hours = employeeDirHours(row, dir);
  if (hours > 0) return true;
  const dirs = personDirections(row.person);
  const other = employeeDirHours(row, dir === "playables" ? "mgx" : "playables");
  return dirs.includes(dir) && other <= 0;
}
function employeePayRow(row, dir) {
  const hours = employeeDirHours(row, dir);
  const rate = employeeDirRate(row, dir);
  const usdAmt = hours * rate;
  const card = normalizeCard(row.person.bankCard);
  const iban = normalizeIban(row.person.iban);
  const copy = payCopy(row);
  const payCell = `<div class="fin-pay">
            <input class="fin-pay-input fin-card-input" data-id="${row.person.id}" data-kind="card" value="${escapeHtml(card ? formatCard(card) : "")}" placeholder="Card" spellcheck="false" autocomplete="off" inputmode="numeric" />
            <input class="fin-pay-input fin-iban-input" data-id="${row.person.id}" data-kind="iban" value="${escapeHtml(iban)}" placeholder="IBAN" spellcheck="false" autocomplete="off" />
            <button type="button" class="btn ghost fin-copy"${copy ? "" : " disabled"}>${copy ? `Copy ${copy.kind}` : "Copy"}</button>
          </div>`;
  const legal = String(row.person.legalName || "").trim();
  const title = jobMeta(row.person).title;
  const who = `<div class="fin-who">
            ${personCell(row.person.id)}
            <div class="fin-legal">${escapeHtml(title)}${legal ? ` · ${escapeHtml(legal)}` : ""}</div>
          </div>`;
  return `<tr class="fin-pay-row" data-id="${row.person.id}" data-dir="${dir}" data-hours="${hours}" data-fallback="${rate}" data-all-hours="${row.allHours ? "1" : "0"}">
        <td>${who}</td>
        <td class="num">${hoursLabel(hours)}</td>
        <td class="num"><input class="fin-person-rate" data-id="${row.person.id}" data-dir="${dir}" type="number" min="0" step="0.5" value="${rate}" /></td>
        <td class="num" data-usd>${usd(usdAmt)}</td>
        <td class="num" data-uah><b>${uah(usdAmt * nbuRate())}</b></td>
        <td>${payCell}</td>
      </tr>`;
}
function employeeTable(title, rows, unRow, emplUsd, emplUah) {
  const body = rows.map((row) => employeePayRow(row, title === "Playables" ? "playables" : "mgx")).join("");
  return `
      <div class="fin-dir-block">
        <h3 class="fin-dir-title">${escapeHtml(title)}</h3>
        <div class="fin-scroll">
          <table class="fin-table">
            <thead><tr><th>Person</th><th class="num">Hours</th><th class="num">$/h</th><th class="num">Hours × $/h</th><th class="num">UAH</th><th>Card / IBAN</th></tr></thead>
            <tbody>${body}${unRow || ""}</tbody>
            <tfoot><tr><td>EMPL</td><td class="num" data-empl-hours></td><td></td><td class="num" data-empl-usd>${usd(emplUsd)}</td><td class="num" data-empl-uah>${uah(emplUah)}</td><td></td></tr></tfoot>
          </table>
        </div>
      </div>`;
}
function renderEmployees(fin) {
  const mgxRows = fin.payroll.filter((row) => employeeInDirection(row, "mgx"));
  const playRows = fin.payroll.filter((row) => employeeInDirection(row, "playables"));
  const mgxUsd = mgxRows.reduce((s, row) => s + employeeDirHours(row, "mgx") * employeeDirRate(row, "mgx"), 0);
  const playUsd = playRows.reduce((s, row) => s + employeeDirHours(row, "playables") * employeeDirRate(row, "playables"), 0);
  const unRow = fin.unassignedProjects
    ? `<tr class="fin-warn-row">
        <td>Unassigned</td>
        <td class="num">${hoursLabel(fin.unassignedHours)}</td>
        <td colspan="4"></td>
      </tr>`
    : "";
  const empty = `<p class="io-empty">No hours this month.</p>`;
  return `
    <section class="group fin-card">
      <div class="fin-rates">
        <label>NBU USD/UAH <input id="finNbu" type="number" min="0" step="0.01" value="${fin.fx}" /></label>
      </div>
      ${mgxRows.length || unRow ? employeeTable("MGX", mgxRows, unRow, mgxUsd, mgxUsd * fin.fx) : `<div class="fin-dir-block"><h3 class="fin-dir-title">MGX</h3>${empty}</div>`}
      ${playRows.length ? employeeTable("Playables", playRows, "", playUsd, playUsd * fin.fx) : `<div class="fin-dir-block"><h3 class="fin-dir-title">Playables</h3>${empty}</div>`}
    </section>`;
}

function employeePayFx() {
  const n = parseRate($("finNbu")?.value);
  if (n === null || n === false || n <= 0) return nbuRate();
  return n;
}

function refreshEmployeePay() {
  const root = $("board");
  if (!root) return;
  const fx = employeePayFx();
  root.querySelectorAll("table.fin-table").forEach((table) => {
    let empl = 0;
    table.querySelectorAll("tr.fin-pay-row").forEach((tr) => {
      const hours = Number(tr.dataset.hours) || 0;
      const fallback = Number(tr.dataset.fallback);
      const parsed = parseRate(tr.querySelector(".fin-person-rate")?.value);
      const rate = parsed === null || parsed === false ? (Number.isFinite(fallback) ? fallback : 15) : parsed;
      const usdAmt = hours * rate;
      empl += usdAmt;
      const usdEl = tr.querySelector("[data-usd]");
      const uahEl = tr.querySelector("[data-uah]");
      if (usdEl) usdEl.textContent = usd(usdAmt);
      if (uahEl) uahEl.innerHTML = `<b>${uah(usdAmt * fx)}</b>`;
    });
    const footUsd = table.querySelector("[data-empl-usd]");
    const footUah = table.querySelector("[data-empl-uah]");
    if (footUsd) footUsd.textContent = usd(empl);
    if (footUah) footUah.textContent = uah(empl * fx);
  });
}

function bindEmployeePay() {
  const root = $("board");
  if (!root) return;
  root.querySelectorAll(".fin-person-rate").forEach((el) => {
    el.addEventListener("input", refreshEmployeePay);
    el.addEventListener("change", () => saveEmployeeRates({ silent: true }));
  });
  root.querySelectorAll(".fin-card-input, .fin-iban-input").forEach((el) => {
    el.addEventListener("input", () => refreshPayCopyButton(el.closest("tr")));
    el.addEventListener("change", () => saveEmployeeRates({ silent: true }));
    el.addEventListener("blur", () => {
      if (el.classList.contains("fin-card-input")) {
        const digits = normalizeCard(el.value);
        el.value = digits ? formatCard(digits) : "";
      } else {
        el.value = normalizeIban(el.value);
      }
      refreshPayCopyButton(el.closest("tr"));
    });
  });
  $("finNbu")?.addEventListener("input", refreshEmployeePay);
  $("finNbu")?.addEventListener("change", () => saveNbuRate({ silent: true }));
}

function ensureNbu() {
  if (state.nbu || state.db?.meta?.nbuRate) return;
  state.nbu = { rate: 41.2, date: "", source: "fallback" };
  fetch("/api/nbu")
    .then((r) => r.json())
    .then((nbu) => {
      if (!nbu || !nbu.rate) return;
      state.nbu = nbu;
      if (state.view === "close") render();
    })
    .catch(() => {});
}

function monthFolderName(ym) {
  const [y, m] = String(ym || "").split("-").map(Number);
  if (!y || !m) return "";
  const name = new Date(y, m - 1, 1).toLocaleString("en-US", { month: "long" });
  return `${String(m).padStart(2, "0")}_${name}`;
}

function openDriveFolder(url) {
  const href = String(url || "").trim();
  if (!href) return false;
  window.open(href, "_blank", "noopener,noreferrer");
  return true;
}

async function openInvoiceFolder(direction) {
  const dir = direction === "playables" ? "playables" : "mgx";
  const out = await api("/api/finance/invoice/reveal", { month: state.month, role: me().role, direction: dir });
  const url = dir === "playables" ? out.playableFolderUrl || out.folderUrl : out.folderUrl;
  const path = dir === "playables" ? out.playableFolderPath || out.folderPath : out.folderPath;
  if (out.error || !url) {
    toast(out.error || "Could not open the Drive invoice folder");
    return;
  }
  openDriveFolder(url);
  toast(`Opened ${path || (dir === "playables" ? "the Playable invoice folder" : "the MGX invoice folder")}`);
}

async function createMonthInvoices() {
  const btn = $("btnCreateInvoices");
  if (btn?.classList.contains("is-busy")) return;
  setBusy(btn, true, "Writing Word + PDF to Drive…");
  let out = {};
  try {
    out = await api("/api/finance/invoice", {
      line: "ALL",
      month: state.month,
      role: me().role,
      nbuRate: nbuRate(),
    });
  } finally {
    setBusy(btn, false);
  }
  if (out.error || !out.ok) {
    toast(out.error || "Could not create the invoices");
    return;
  }
  const n = (out.drive?.uploaded || out.files || []).length;
  const pdfNote = out.pdfReady ? "" : ` · ${out.pdfError || "PDF skipped"}`;
  if (out.folderUrl) openDriveFolder(out.folderUrl);
  if (out.playableFolderUrl) openDriveFolder(out.playableFolderUrl);
  toast(`Created ${n} files in Drive${pdfNote}`);
}

async function saveNbuRate(opts = {}) {
  const rate = parseRate($("finNbu")?.value);
  if (rate === null || rate === false || rate <= 0) {
    toast("NBU rate must be more than 0");
    return;
  }
  const out = await api("/api/meta/update", {
    role: me().role,
    month: state.month,
    nbuRate: rate,
  });
  if (out.error || !out.state) {
    toast(out.error || "Could not save NBU rate");
    return;
  }
  state.nbu = { rate, date: "", source: "manual" };
  applyState(out.state);
  if (!opts.silent) toast(`NBU ${rate} ₴ / $`);
}

async function saveEmployeeRates(opts = {}) {
  const byId = new Map();
  for (const el of $("board").querySelectorAll(".fin-person-rate")) {
    const p = person(el.dataset.id);
    if (!p) continue;
    const parsed = parseRate(el.value);
    if (parsed === false) {
      toast(`Pay rate for ${p.name} must be 0 or more`);
      return;
    }
    const rate = parsed === null ? rolePayRate(p) : parsed;
    const row = el.closest("tr");
    const dir = el.dataset.dir === "playables" ? "playables" : el.dataset.dir === "mgx" ? "mgx" : "";
    const cur = byId.get(p.id) || { id: p.id, rates: {} };
    if (dir) cur.rates[dir] = rate;
    cur.rateUsd = rate;
    const card = normalizeCard(row?.querySelector(".fin-card-input")?.value);
    const iban = normalizeIban(row?.querySelector(".fin-iban-input")?.value);
    if (card || cur.bankCard == null) cur.bankCard = card;
    if (iban || cur.iban == null) cur.iban = iban;
    byId.set(p.id, cur);
  }
  const people = [...byId.values()];
  if (!people.length) return;
  const out = await api("/api/people/update", { role: me().role, people });
  if (out.error || !out.state) {
    toast(out.error || "Could not save pay rates");
    return;
  }
  applyState(out.state);
  if (!opts.silent) toast("Pay rates saved");
}

function captureTeamDrafts() {
  $("board")?.querySelectorAll(".team-row").forEach((row) => {
    const input = row.querySelector(".team-name");
    if (input) state.teamDrafts[row.dataset.id] = input.value;
  });
}

function displayName(p) {
  const draft = state.teamDrafts[p.id];
  return draft !== undefined ? draft : p.name;
}

function crewJobSelect(p) {
  if (p.role !== "designer" && p.role !== "teamlead") {
    return `<span class="job-mark">${jobBadgeHtml(p)}<span class="job-title">${escapeHtml(jobMeta(p).title)}</span></span>`;
  }
  return `<span class="job-mark">${jobBadgeHtml(p)}
    <select class="team-job" aria-label="Role">
      <option value="designer" ${p.role === "designer" ? "selected" : ""}>Motion design</option>
      <option value="teamlead" ${p.role === "teamlead" ? "selected" : ""}>Team Lead</option>
    </select>
  </span>`;
}

function teamRowPayload(row) {
  const id = row?.dataset.id;
  const name = String(row?.querySelector(".team-name")?.value || "").trim();
  const job = row?.querySelector(".team-job")?.value || "";
  const payload = { id, name };
  if (job) payload.job = job;
  return payload;
}

async function flushTeamNames() {
  captureTeamDrafts();
  const people = [...($("board")?.querySelectorAll(".team-row") || [])]
    .map((row) => teamRowPayload(row))
    .filter((p) => p.id && p.name);
  if (!people.length) return { state: state.db };
  const out = await api("/api/people/update", { people, role: me().role });
  if (out.error || !out.state) return out;
  for (const p of people) delete state.teamDrafts[p.id];
  applyState(out.state);
  return out;
}

function renderTeam() {
  if (!isFinance()) {
    state.view = "board";
    render();
    return;
  }
  const rows = state.db.people
    .map(
      (p) => `
      <div class="team-row" data-id="${p.id}">
        <span class="person">${avatarHtml(p)}${escapeHtml(displayName(p))}</span>
        ${crewJobSelect(p)}
        <input class="team-name" value="${escapeHtml(displayName(p))}" placeholder="Real name" />
        <button class="btn primary team-save" type="button">Save</button>
        <button class="btn ghost team-del" type="button">Delete</button>
      </div>`
    )
    .join("");
  $("board").innerHTML = `
    <section class="group" style="padding:18px">
      <h2 style="margin:0 0 12px">Team names</h2>
      <p class="team-hint">Motion design and Team Lead can switch. Pay stays $15/h on their hours. Keep at least one Team Lead.</p>
      ${rows}
      <div class="team-add">
        <select id="addJob">${TEAM_JOBS.map((j) => `<option value="${j.id}">${j.label}</option>`).join("")}</select>
        <button class="btn" type="button" id="addPerson">Add person</button>
        <button class="btn primary" type="button" id="saveAllNames">Save all names</button>
      </div>
    </section>`;
  $("board").querySelectorAll(".team-name").forEach((input) => {
    input.addEventListener("input", () => {
      state.teamDrafts[input.closest(".team-row").dataset.id] = input.value;
    });
  });
  $("board").querySelectorAll(".team-save").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const row = btn.closest(".team-row");
      const payload = teamRowPayload(row);
      if (!payload.name) {
        toast("Name cannot be empty");
        return;
      }
      const out = await api("/api/people/update", { ...payload, role: me().role });
      if (out.error || !out.state) {
        toast(out.error || "Could not save");
        return;
      }
      delete state.teamDrafts[row.dataset.id];
      applyState(out.state);
      toast("Name saved");
    });
  });
  $("board").querySelectorAll(".team-del").forEach((btn) => {
    btn.addEventListener("click", () => openDeletePerson(btn.closest(".team-row").dataset.id));
  });
  $("saveAllNames").onclick = async () => {
    const out = await flushTeamNames();
    if (out.error) toast(out.error);
    else toast("All names saved");
  };
  $("addPerson").onclick = async () => {
    const job = $("addJob").value;
    const flushed = await flushTeamNames();
    if (flushed.error) {
      toast(flushed.error);
      return;
    }
    const out = await api("/api/people/add", { role: me().role, job });
    if (out.error || !out.state) {
      toast(out.error || "Could not add");
      return;
    }
    applyState(out.state);
    toast("Person added");
  };
}

function assignedTo(id) {
  return (state.db.tasks || []).filter((t) => t.assigneeId === id);
}

function openDeletePerson(id) {
  const p = person(id);
  if (!p) return;
  if (id === me().id) {
    toast("You cannot delete the person you are logged in as");
    return;
  }
  if (p.role === "client" && (state.db.people || []).filter((x) => x.role === "client").length <= 1) {
    toast("Keep the SuperPlay hours login");
    return;
  }
  const held = assignedTo(id);
  $("delTitle").textContent = `Delete ${displayName(p)}?`;
  $("delProjects").innerHTML = held.length
    ? held.map((t) => `<li title="${escapeHtml(t.name)}">${escapeHtml(t.name)}</li>`).join("")
    : "";
  $("delProjects").hidden = !held.length;
  const wrap = $("delMoveWrap");
  wrap.hidden = !held.length;
  if (held.length) {
    $("delIntro").textContent = `${held.length} project${held.length === 1 ? "" : "s"} — choose who takes them.`;
    const others = state.db.people
      .filter((x) => x.id !== id && x.role !== "client")
      .sort((a, b) => {
        const ra = a.role === p.role ? 0 : 1;
        const rb = b.role === p.role ? 0 : 1;
        if (ra !== rb) return ra - rb;
        return String(displayName(a)).localeCompare(String(displayName(b)));
      });
    $("delMove").innerHTML =
      `<option value="" disabled selected>Choose…</option>` +
      `<option value="__none__">Leave unassigned</option>` +
      others
        .map((x) => `<option value="${x.id}">${escapeHtml(displayName(x))} · ${jobMeta(x).code} ${escapeHtml(jobMeta(x).title)}</option>`)
        .join("");
    $("delConfirm").disabled = true;
  } else {
    $("delIntro").textContent = "";
    $("delConfirm").disabled = false;
  }
  $("delModal").dataset.id = id;
  $("delModal").classList.add("show");
}

async function confirmDeletePerson() {
  const id = $("delModal").dataset.id;
  const p = person(id);
  if (!p) return;
  const held = assignedTo(id);
  let reassignTo;
  if (held.length) {
    const raw = $("delMove").value;
    if (!raw) {
      toast("Choose where the projects go");
      return;
    }
    reassignTo = raw === "__none__" ? "" : raw;
  }
  const flushed = await flushTeamNames();
  if (flushed.error) {
    toast(flushed.error);
    return;
  }
  const payload = { id, role: me().role, actorId: me().id };
  if (held.length) payload.reassignTo = reassignTo;
  const out = await api("/api/people/delete", payload);
  if (out.error || !out.state) {
    toast(out.error || "Could not delete");
    return;
  }
  delete state.teamDrafts[id];
  if (state.designerFilter === id) state.designerFilter = null;
  $("delModal").classList.remove("show");
  applyState(out.state);
  const moved = held.length ? (reassignTo ? ` · ${held.length} moved` : ` · ${held.length} unassigned`) : "";
  toast(`Deleted ${displayName(p)}${moved}`);
}

function liveAssigneeId(t) {
  return $("stPerson") ? $("stPerson").value : t.assigneeId || "";
}
function helpPersonOptions(t, selectedId, assigneeId, fromTask) {
  const who = assigneeId !== undefined ? assigneeId : liveAssigneeId(t) || t.assigneeId || "";
  const fromDom = fromTask
    ? []
    : [...($("helpRows")?.querySelectorAll(".help-person") || [])].map((el) => el.value);
  const source = fromDom.length ? fromDom : helpEntries(t).map((row) => row.id);
  const taken = new Set(source.filter((id) => id && id !== selectedId));
  if (who) taken.add(who);
  return designers()
    .filter((p) => p.id !== who && (p.id === selectedId || !taken.has(p.id)))
    .map(
      (p) =>
        `<option value="${p.id}" ${p.id === selectedId && p.id !== who ? "selected" : ""}>${escapeHtml(p.name)} · ${jobMeta(p).code}</option>`
    )
    .join("");
}
function playableHoursHtml(t, editable) {
  const billed = hoursOf(t);
  const artH = roundHours(t.assigneeHours) || hoursOwned(t);
  const help = helpEntries(t);
  const progH = roundHours(t.programmerHours);
  const producer = roundHours(artH + help.reduce((s, row) => s + row.hours, 0) + progH);
  const buffer = Math.max(0, roundHours(billed - producer));
  const ads = artDirectors();
  const devs = programmers();
  if (!editable && !t.assigneeId && !t.programmerId && !help.length) return "";
  const adSelect = (id, selected) =>
    `<select id="${id}">
      <option value="">— lead AD</option>
      ${ads
        .map(
          (p) =>
            `<option value="${p.id}" ${selected === p.id ? "selected" : ""}>${escapeHtml(p.name)} · AD</option>`
        )
        .join("")}
    </select>`;
  const splitSelect = (selected) =>
    `<select id="stSplitAd">
      <option value="">— no split</option>
      ${ads
        .filter((p) => p.id !== t.assigneeId)
        .map(
          (p) =>
            `<option value="${p.id}" ${selected === p.id ? "selected" : ""}>${escapeHtml(p.name)} · AD</option>`
        )
        .join("")}
    </select>`;
  const split = help[0] || {};
  const body = editable
    ? `<div class="ops-item"><label>Billed hours</label>
        <input id="stHours" type="number" min="0" step="0.1" value="${t.hours ?? ""}" />
        <p class="status-hint">Client $40/h. Buffer stays studio.</p></div>
       <div class="ops-item"><label>Lead AD hours</label>
        <input id="stAdHours" type="number" min="0" step="0.1" value="${artH || ""}" /></div>
       <div class="ops-item"><label>Split AD</label>
        ${splitSelect(split.id || "")}
        <input id="stSplitHours" type="number" min="0" step="0.1" value="${split.hours || ""}" /></div>
       <div class="ops-item"><label>Programmer</label>
        <select id="stProgrammer">
          <option value="">— unassigned</option>
          ${devs
            .map(
              (p) =>
                `<option value="${p.id}" ${t.programmerId === p.id ? "selected" : ""}>${escapeHtml(p.name)} · DEV</option>`
            )
            .join("")}
        </select>
        <input id="stProgHours" type="number" min="0" step="0.1" value="${progH || ""}" /></div>`
    : `<p class="status-hint">Lead ${escapeHtml(person(t.assigneeId)?.name || "—")} ${artH || 0}h
        ${split.id ? ` · split ${escapeHtml(person(split.id)?.name || "")} ${split.hours}h` : ""}
        ${t.programmerId ? ` · DEV ${escapeHtml(person(t.programmerId)?.name || "")} ${progH || 0}h` : ""}</p>`;
  return `<section class="help-split">
      <label>Playable hours</label>
      <p class="status-hint">Producer pay is art + DEV. Billed may include a studio buffer. LP $7 is on producer hours only.</p>
      ${body}
      <div class="help-owner"><span>Producer</span><b id="playProducer">${producer}h</b></div>
      <div class="help-owner"><span>Studio buffer</span><b id="playBuffer">${buffer}h</b></div>
    </section>`;
}
function helpSplitHtml(t, editable) {
  const total = hoursOf(t);
  const help = helpEntries(t);
  const ownerH = hoursOwned(t);
  const ownerName = person(t.assigneeId)?.name || "Unassigned";
  if (!editable && !help.length) return "";
  const rows = help
    .map(
      (row) => `
      <div class="help-row">
        ${
          editable
            ? `<select class="help-person">${helpPersonOptions(t, row.id, t.assigneeId, true)}</select>
               <input class="help-hours" type="number" min="0.1" step="0.1" value="${row.hours}" />
               <button type="button" class="btn ghost help-del" title="Remove">×</button>`
            : `<span>${personCell(row.id)}</span><span class="help-h">${row.hours}h</span>`
        }
      </div>`
    )
    .join("");
  return `<section class="help-split">
      <label>Hours split</label>
      <p class="status-hint">Client stays ${total}h. Only studio pay moves — render help, not extra SuperPlay hours.</p>
      <div class="help-owner"><span>${escapeHtml(ownerName)} · Who</span><b id="helpRemainder">${ownerH}h</b></div>
      <div id="helpRows">${rows}</div>
      ${
        editable
          ? `<button type="button" class="btn ghost" id="helpAdd">Add help hours</button>`
          : ""
      }
    </section>`;
}
function readHelpFromCard(assigneeId) {
  const help = [];
  const seen = new Set();
  $("drawer")?.querySelectorAll(".help-row").forEach((row) => {
    const id = row.querySelector(".help-person")?.value || "";
    const hours = roundHours(String(row.querySelector(".help-hours")?.value || "").replace(",", "."));
    if (!id || id === assigneeId || hours <= 0 || seen.has(id)) return;
    seen.add(id);
    help.push({ id, hours });
  });
  return help;
}
function refreshHelpRemainder(t) {
  const hint = $("helpRemainder");
  if (!hint) return;
  const assigneeId = $("stPerson")?.value || t.assigneeId;
  const total = $("stShifts") ? hoursFromShifts(parseShifts($("stShifts").value) || 0) : hoursOf(t);
  const given = readHelpFromCard(assigneeId).reduce((s, row) => s + row.hours, 0);
  const rest = Math.max(0, roundHours(total - given) || 0);
  const name = person(assigneeId)?.name || "Unassigned";
  hint.closest(".help-owner")?.querySelector("span") &&
    (hint.closest(".help-owner").querySelector("span").textContent = `${name} · Who`);
  hint.textContent = `${rest}h`;
  hint.classList.toggle("is-over", given > total + 0.001);
}
function bindHelpSplit(t) {
  const box = $("drawer")?.querySelector(".help-split");
  if (!box || !canEditHelp()) return;
  const paint = () => refreshHelpRemainder(t);
  box.addEventListener("input", paint);
  box.addEventListener("change", paint);
  $("helpAdd")?.addEventListener("click", () => {
    const assigneeId = $("stPerson")?.value || t.assigneeId;
    const taken = new Set(readHelpFromCard(assigneeId).map((row) => row.id));
    if (assigneeId) taken.add(assigneeId);
    const next = designers().find((p) => !taken.has(p.id));
    if (!next) {
      toast("Everyone already has hours on this task");
      return;
    }
    const draft = { ...t, assigneeId, help: [...readHelpFromCard(assigneeId), { id: next.id, hours: 0.5 }] };
    const wrap = $("helpRows");
    if (!wrap) return;
    wrap.insertAdjacentHTML(
      "beforeend",
      `<div class="help-row">
        <select class="help-person">${helpPersonOptions(draft, next.id)}</select>
        <input class="help-hours" type="number" min="0.1" step="0.1" value="0.5" />
        <button type="button" class="btn ghost help-del" title="Remove">×</button>
      </div>`
    );
    paint();
  });
  box.addEventListener("click", (e) => {
    const btn = e.target.closest(".help-del");
    if (!btn) return;
    btn.closest(".help-row")?.remove();
    paint();
  });
  $("stPerson")?.addEventListener("change", () => {
    const who = liveAssigneeId(t);
    $("helpRows")?.querySelectorAll(".help-row").forEach((row) => {
      const sel = row.querySelector(".help-person");
      if (sel?.value === who) row.remove();
    });
    $("helpRows")?.querySelectorAll(".help-person").forEach((sel) => {
      const keep = sel.value === who ? "" : sel.value;
      sel.innerHTML = helpPersonOptions(t, keep, who);
      if (keep && [...sel.options].some((o) => o.value === keep)) sel.value = keep;
      else if (!sel.options.length) sel.closest(".help-row")?.remove();
    });
    paint();
  });
  $("stShifts")?.addEventListener("input", paint);
}

function openTask(id) {
  if (isClient()) return;
  const t = state.db.tasks.find((x) => x.id === id);
  if (!t) return;
  state.openId = id;
  const mine = t.assigneeId === me().id || t.programmerId === me().id || helpedOn(t, me().id);
  const canEdit = canOps() || canAssign() || mine;
  const lockedStatus = (t.studioStatus === "approve" || t.studioStatus === "closed") && !canOps();
  const job = cardJob(t);
  const play = isPlayables(t);
  const performer = mine && (isDesigner() || isTeamLead() || isArtDirector() || isProgrammer());
  const canPaste = canPasteResult(t);
  const assignHero = isTeamLead() && !t.assigneeId && !play;
  const peopleOpts = play ? artDirectors() : designers();
  const assignSelect = canAssign()
    ? `<select id="stPerson">
        <option value="">— ${play ? "lead AD" : "unassigned"}</option>
        ${peopleOpts
          .map(
            (p) =>
              `<option value="${p.id}" ${t.assigneeId === p.id ? "selected" : ""}>${escapeHtml(p.name)} · ${jobMeta(p).code}</option>`
          )
          .join("")}
      </select>`
    : personCell(t.assigneeId);
  const heroAssign = assignHero
    ? `<div class="field field-focus">
        <label>Who works this</label>
        ${assignSelect}
      </div>`
    : "";
  const showAssignee = !isPerformer() && !assignHero;
  const whoAssign = showAssignee
    ? `<div class="who-assign"><label>${play ? "Lead Art Director" : "Who works this"}</label>${canAssign() ? assignSelect : personCell(t.assigneeId)}</div>`
    : "";
  const opsTime = canEditTime() && !play
    ? `<div class="ops-item"><label>Shifts</label>
        <input id="stShifts" type="number" min="0" step="0.1" value="${t.shifts ?? ""}" />
        <p class="status-hint" id="stHoursHint">${hoursFromShifts(t.shifts || 0)} h</p></div>
       <div class="ops-item"><label>Deadline</label>
        <input id="stDeadline" type="date" value="${parseDeadlineIso(t.deadline)}" />
        <p class="status-hint">Same as Excel DEADLINE</p></div>`
    : canEditTime() && play
      ? `<div class="ops-item"><label>Deadline</label>
        <input id="stDeadline" type="date" value="${parseDeadlineIso(t.deadline)}" />
        <p class="status-hint">Same as Excel DEADLINE</p></div>`
      : "";
  const whoBlock = `<section class="who-block">
      ${whoAssign}
      <div class="who-status">
        <label>Status</label>
        ${statusButtonsHtml(t, canEdit, lockedStatus)}
      </div>
    </section>`;
  const st = STATUS[t.studioStatus] || STATUS.new;
  const sourceBlock = sourceHtml(t);
  const resultBlock = resultHtml(t, performer, canPaste);
  $("drawer").innerHTML = `
    <div class="drawer-head">
      ${
        canOps()
          ? `<input id="stName" class="task-name-edit" value="${escapeHtml(t.name)}" spellcheck="false" aria-label="Project name" />`
          : `<h2>${escapeHtml(t.name)}</h2>`
      }
    </div>
    <div class="meta"><span class="pill line-${t.line}">${t.line}</span> ${play ? `${t.hours || 0} h billed` : `${t.shifts || 0} shift · ${t.hours || 0} h`} · <span id="stMetaStatus" class="pill ${st.cls}">${st.label}</span></div>
    <div class="drawer-body">
    <div class="card-job tone-${job.tone}">
      ${jobBadgeHtml(me())}
      <div>
        <strong>${escapeHtml(job.title)}</strong>
        <p>${escapeHtml(job.body)}</p>
      </div>
    </div>
    ${heroAssign}
    ${pinHtml(t)}
    ${notesHtml(t)}
    ${sourceBlock || resultBlock ? `<div class="io-stack">${sourceBlock}${resultBlock}</div>` : ""}
    ${whoBlock}
    ${play ? (isFinance() ? playableHoursHtml(t, true) : "") : helpSplitHtml(t, canEditHelp())}
    ${opsTime ? `<div class="card-ops">${opsTime}</div>` : ""}
    </div>
    <div class="drawer-actions">
      <div class="drawer-actions-main">
        ${canOps() && isSendable(t) ? `<button type="button" class="btn green" id="exportOne">Send this to client</button>` : ""}
        ${canOps() && isClientCopyable(t) ? `<button type="button" class="btn" id="copyOne">Copy for client</button>` : ""}
        ${canOps() && t.studioStatus !== "closed" ? `<button type="button" class="btn" id="closeOne">Mark Closed</button>` : ""}
        ${canOps() && isDeletableTask(t) ? `<button type="button" class="btn danger" id="deleteTask">Delete</button>` : ""}
      </div>
      <div class="drawer-actions-end">
        <span class="save-wait" id="saveWait" hidden></span>
        <button type="button" class="btn ghost" id="closeCard">Close</button>
        ${canEdit || canOps() ? `<button type="button" class="btn primary" id="saveTask">Save</button>` : ""}
      </div>
    </div>
  `;
  const pendingShots = [];
  function fileToShot(file) {
    return new Promise((resolve) => {
      if (!file || !String(file.type || "").startsWith("image/")) {
        resolve(null);
        return;
      }
      if (file.size > 6 * 1024 * 1024) {
        toast("Screenshot is over 6 MB");
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve({ mime: file.type || "image/png", data: String(reader.result || "") });
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }
  function renderPendingShots() {
    const box = $("stCommentShots");
    if (!box) return;
    box.innerHTML = pendingShots
      .map(
        (s, i) => `<button type="button" class="notes-pending" data-i="${i}" aria-label="Remove screenshot">
          <img src="${s.data}" alt="" />
        </button>`
      )
      .join("");
    box.querySelectorAll(".notes-pending").forEach((btn) => {
      btn.addEventListener("click", () => {
        pendingShots.splice(Number(btn.dataset.i), 1);
        renderPendingShots();
      });
    });
  }
  async function addPendingFiles(files) {
    for (const file of files || []) {
      if (pendingShots.length >= 8) {
        toast("Up to 8 screenshots on one note");
        break;
      }
      const shot = await fileToShot(file);
      if (shot) pendingShots.push(shot);
    }
    renderPendingShots();
  }
  async function postClientNote({ reopen } = { reopen: true }) {
    const body = String($("stComment")?.value || "").trim();
    if (!body && !pendingShots.length) {
      toast("Paste client text or a screenshot");
      return false;
    }
    const out = await api("/api/tasks/comment", {
      id: t.id,
      body,
      attachments: pendingShots.map((s) => ({ mime: s.mime, data: s.data })),
      actorId: me().id,
      role: me().role,
    });
    if (out.error || !out.state) {
      toast(out.error || "Could not add note");
      return false;
    }
    pendingShots.length = 0;
    applyState(out.state);
    toast("Note added");
    if (reopen) openTask(t.id);
    else {
      if ($("stComment")) $("stComment").value = "";
      renderPendingShots();
    }
    return true;
  }
  $("addNote")?.addEventListener("click", () => postClientNote());
  $("stCommentFiles")?.addEventListener("change", async (e) => {
    await addPendingFiles([...e.target.files]);
    e.target.value = "";
  });
  $("stComment")?.addEventListener("paste", async (e) => {
    const files = [];
    for (const item of e.clipboardData?.items || []) {
      if (String(item.type || "").startsWith("image/")) {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    if (!files.length) return;
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    if (text && $("stComment")) {
      const el = $("stComment");
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? start;
      el.value = el.value.slice(0, start) + text + el.value.slice(end);
    }
    await addPendingFiles(files);
  });
  const dropBox = $("stCommentBox");
  if (dropBox) {
    dropBox.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropBox.classList.add("is-drop");
    });
    dropBox.addEventListener("dragleave", () => dropBox.classList.remove("is-drop"));
    dropBox.addEventListener("drop", async (e) => {
      e.preventDefault();
      dropBox.classList.remove("is-drop");
      await addPendingFiles([...(e.dataTransfer?.files || [])]);
    });
  }
  $("drawer")?.querySelectorAll(".notes-del").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const out = await api("/api/tasks/comment", {
        id: t.id,
        deleteId: btn.dataset.id,
        actorId: me().id,
        role: me().role,
      });
      if (out.error || !out.state) {
        toast(out.error || "Could not remove note");
        return;
      }
      applyState(out.state);
      openTask(t.id);
    });
  });
  bindNoteShots(t);
  const N = window.LGNotices;
  if (N && N.forPerson(state.db, me().id, true).some((n) => n.taskId === id)) {
    ackNotices({ taskId: id });
  }
  const syncDoneOption = () => {
    const hint = $("stDoneHint");
    const typed = $("stResult")?.value || "";
    const hasResult = hasResultLink(t, typed);
    const checkBtn = $("drawer")?.querySelector('.status-btn[data-status="tlcheck"]');
    if (checkBtn && t.studioStatus !== "tlcheck") {
      checkBtn.disabled = statusButtonDisabled(t, "tlcheck", {
        canEdit,
        locked: lockedStatus,
        typedResult: typed,
      });
    }
    const doneBtn = $("drawer")?.querySelector('.status-btn[data-status="done"]');
    if (doneBtn && t.studioStatus !== "done") {
      doneBtn.disabled = statusButtonDisabled(t, "done", {
        canEdit,
        locked: lockedStatus,
        typedResult: typed,
      });
    }
    const htmlBtn = $("drawer")?.querySelector('.status-btn[data-status="htmlready"]');
    if (htmlBtn && t.studioStatus !== "htmlready") {
      htmlBtn.disabled = statusButtonDisabled(t, "htmlready", {
        canEdit,
        locked: lockedStatus,
        typedResult: typed,
      });
    }
    if (hint) {
      if (isPlayables(t)) {
        if (isProgrammer() && !hasResult && t.studioStatus === "build") {
          hint.textContent = "Paste the HTML link, then HTML ready.";
        } else if (canOps() && t.studioStatus === "storyboard") {
          hint.textContent = "Send to client — that sets Client art. Only LP talks to SuperPlay.";
        } else if (canOps() && t.studioStatus === "htmlready") {
          hint.textContent = "Send to client, or Mark Closed if they already accepted.";
        } else if (canOps() && t.studioStatus === "approve") {
          hint.textContent = "Client accepted → Closed.";
        } else {
          hint.textContent = "";
        }
      } else if (performer && !hasResult && !["tlcheck", "done", "approve", "closed"].includes(t.studioStatus)) {
        hint.textContent = "Paste the result link, then TL Check.";
      } else if (isTeamLead() && t.studioStatus === "tlcheck") {
        hint.textContent = "Check the result, then Done. LP sends after that.";
      } else if (canOps() && t.studioStatus === "done") {
        hint.textContent = "Send to client, or Mark Closed if they already accepted.";
      } else if (canOps() && t.studioStatus === "approve") {
        hint.textContent = "Client accepted → Closed. Need Fixing if they bounce it.";
      } else if (canOps() && t.studioStatus === "closed") {
        hint.textContent = "Closed. Need Fixing only if the client reopens.";
      } else if (canOps() && t.studioStatus === "tlcheck") {
        hint.textContent = "Waiting for TL Check. Send only after Done.";
      } else {
        hint.textContent = "";
      }
    }
  };
  $("stResult")?.addEventListener("input", syncDoneOption);
  $("stResult")?.addEventListener("change", syncDoneOption);
  $("stResult")?.addEventListener("paste", () => setTimeout(syncDoneOption, 0));
  $("drawer")?.querySelectorAll(".status-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.status;
      if (!key || btn.disabled) return;
      if (key === "approve") {
        toast(isPlayables(t) ? "Send is set only when you Send to client" : "Senior Approval is set only when you Send to client");
        return;
      }
      if (key === "closed" && t.studioStatus !== "closed" && !canOps()) {
        toast("Only LP can mark Closed");
        return;
      }
      if (key === "htmlready" && !($("stResult")?.value || t.resultUrl || "").trim()) {
        toast("Paste the HTML link before HTML ready");
        return;
      }
      if (key === "tlcheck" && !($("stResult")?.value || t.resultUrl || "").trim()) {
        toast("Paste the result link before TL Check");
        return;
      }
      if (key === "done" && t.studioStatus !== "tlcheck" && $("stStatus")?.value !== "tlcheck") {
        toast("Done is after TL Check");
        return;
      }
      if (key !== t.studioStatus && !canSetStatus(key, t) && !(key === "closed" && canOps())) {
        toast("This role cannot set " + (STATUS[key]?.label || key));
        return;
      }
      paintStatusButtons(key);
    });
  });
  syncDoneOption();
  $("drawerBg").classList.add("show");
  $("stShifts")?.addEventListener("input", () => {
    const shifts = parseShifts($("stShifts").value);
    const hint = $("stHoursHint");
    if (!hint) return;
    if (shifts === null) {
      hint.textContent = "Enter a number, 0 or more.";
      return;
    }
    hint.textContent = `${hoursFromShifts(shifts)} h`;
  });
  $("closeCard")?.addEventListener("click", closeDrawer);
  $("saveTask")?.addEventListener("click", async () => {
    const saveBtn = $("saveTask");
    if (saveBtn?.classList.contains("is-busy")) return;
    if (canWriteNotes() && (String($("stComment")?.value || "").trim() || pendingShots.length)) {
      const ok = await postClientNote({ reopen: false });
      if (!ok) return;
    }
    const resultUrl = ($("stResult")?.value || t.resultUrl || "").trim();
    const studioStatus = $("stStatus")?.value || t.studioStatus;
    if (studioStatus !== t.studioStatus && !canSetStatus(studioStatus, t)) {
      toast("This role cannot set " + (STATUS[studioStatus]?.label || studioStatus));
      return;
    }
    if (studioStatus === "approve") {
      toast(isPlayables(t) ? "Send is set only when you Send to client" : "Senior Approval is set only when you Send to client");
      return;
    }
    if (studioStatus === "closed" && t.studioStatus !== "closed" && !canOps()) {
      toast("Only LP can mark Closed");
      return;
    }
    if (studioStatus === "htmlready" && !resultUrl) {
      toast("Paste the HTML link before HTML ready");
      return;
    }
    if (studioStatus === "tlcheck" && !resultUrl) {
      toast("Paste the result link before TL Check");
      return;
    }
    if (studioStatus === "done" && !resultUrl) {
      toast("Paste the result link before Done");
      return;
    }
    if (studioStatus === "done" && t.studioStatus !== "tlcheck" && t.studioStatus !== "done") {
      toast("Done is after TL Check");
      return;
    }
    const assigneeId = canAssign() && $("stPerson") ? $("stPerson").value : t.assigneeId;
    const patch = { studioStatus, role: me().role };
    if (canAssign()) patch.assigneeId = assigneeId;
    if (isPlayables(t) && isFinance() && $("stAdHours")) {
      if ($("stHours")) {
        const hours = parseShifts($("stHours").value);
        if (hours === null) {
          toast("Hours must be 0 or more");
          return;
        }
        patch.hours = hours;
      }
      const adHours = roundHours(String($("stAdHours")?.value || "").replace(",", "."));
      const splitId = $("stSplitAd")?.value || "";
      const splitHours = roundHours(String($("stSplitHours")?.value || "").replace(",", "."));
      patch.assigneeHours = adHours;
      patch.help = splitId && splitHours > 0 && splitId !== assigneeId ? [{ id: splitId, hours: splitHours }] : [];
      if ($("stProgrammer")) patch.programmerId = $("stProgrammer").value;
      patch.programmerHours = roundHours(String($("stProgHours")?.value || "").replace(",", "."));
    } else if (!isPlayables(t) && canEditHelp()) {
      const help = readHelpFromCard(assigneeId);
      const total = patch.shifts !== undefined ? hoursFromShifts(patch.shifts) : hoursOf(t);
      const given = help.reduce((s, row) => s + row.hours, 0);
      if (given > total + 0.001) {
        toast("Help hours cannot exceed the client hours on this task");
        return;
      }
      patch.help = help;
    }
    if ($("stResult")) patch.resultUrl = resultUrl;
    if (canEditTime() && $("stShifts")) {
      const shifts = parseShifts($("stShifts").value);
      if (shifts === null) {
        toast("Shifts must be 0 or more");
        return;
      }
      patch.shifts = shifts;
    }
    const nextName = canOps() && $("stName") ? String($("stName").value || "").replace(/\s+/g, " ").trim() : null;
    if (nextName != null && nextName !== t.name) {
      if (!nextName) {
        toast("Paste the full project name");
        return;
      }
      const alsoExcel = t.source && t.source !== "portal" ? " and the Excel row" : "";
      if (
        !confirm(
          `Rename this project on the board, the Drive folder, and the brief Doc${alsoExcel}?\n\n${t.name}\n→\n${nextName}`
        )
      ) {
        return;
      }
      patch.name = nextName;
    }
    const nextBrief = canOps() && $("stBrief") ? $("stBrief").value : null;
    const briefToDrive = nextBrief != null && nextBrief !== (t.brief || "");
    if (nextBrief != null) patch.brief = nextBrief;
    if (canEditTime() && $("stDeadline")) {
      const deadline = parseDeadlineIso($("stDeadline").value);
      if ($("stDeadline").value && !deadline) {
        toast("Deadline must be a date");
        return;
      }
      patch.deadline = deadline;
    }
    const helpNote = patch.help
      ? patch.help.map((row) => `${person(row.id)?.name || row.id} ${row.hours}h`).join(", ")
      : "";
    const prevHelp = JSON.stringify(helpEntries(t));
    const nextHelp = JSON.stringify(patch.help || helpEntries(t));
    const note =
      patch.help && prevHelp !== nextHelp
        ? helpNote
          ? `${me().name} split hours: ${person(assigneeId)?.name || "Who"} keeps the rest · ${helpNote}`
          : `${me().name} cleared help hours`
        : patch.shifts !== undefined && patch.shifts !== Number(t.shifts)
        ? `${me().name} set ${patch.shifts} shifts → ${hoursFromShifts(patch.shifts)} h`
        : patch.deadline !== undefined && patch.deadline !== parseDeadlineIso(t.deadline)
          ? patch.deadline
            ? `${me().name} set deadline ${excelDate(patch.deadline)}`
            : `${me().name} cleared deadline`
        : studioStatus === "closed" && t.studioStatus !== "closed"
          ? `${me().name} marked Closed (client accepted)`
          : resultUrl && resultUrl !== t.resultUrl
            ? `${me().name} pasted the result`
            : `${me().name} updated status`;
    const actions = $("drawer")?.querySelectorAll(".drawer-actions button") || [];
    const hint = $("saveWait");
    if (hint) {
      hint.hidden = false;
      hint.textContent = "Saving…";
    }
    actions.forEach((btn) =>
      setBusy(btn, true, btn.id === "saveTask" ? "Saving…" : undefined)
    );
    try {
      await updateTask(t.id, { ...patch, note }, { close: true });
    } catch (err) {
      toast(err?.message || "Could not save");
    } finally {
      if (hint) hint.hidden = true;
      actions.forEach((btn) => setBusy(btn, false));
    }
  });
  $("exportOne")?.addEventListener("click", async () => {
    const btn = $("exportOne");
    setBusy(btn, true, "Copying…");
    try {
      await sendToClient([t.id]);
    } finally {
      setBusy(btn, false);
    }
  });
  $("deleteTask")?.addEventListener("click", () => askDeleteTasks([t.id]));
  $("closeOne")?.addEventListener("click", () => {
    updateTask(
      t.id,
      {
        studioStatus: "closed",
        role: me().role,
        note: `${me().name} marked Closed (client accepted)`,
      },
      { close: true }
    );
  });
  if (!isPlayables(t)) bindHelpSplit(t);
  $("ensureDrive")?.addEventListener("click", () => retryDrivePack(t));
  fillDrivePackIfMissing(t);
  $("copyOne")?.addEventListener("click", async () => {
    const btn = $("copyOne");
    setBusy(btn, true, "Copying…");
    try {
      await copyForClient(mondayReply(t));
    } finally {
      setBusy(btn, false);
    }
  });
}

function closeDrawer() {
  closeShot();
  $("drawerBg").classList.remove("show");
  state.openId = null;
}

async function updateTask(id, patch, opts = {}) {
  const out = await api("/api/tasks/update", { id, actorId: me().id, ...patch });
  if (out.error || !out.state) {
    toast(out.error || "Could not save");
    return;
  }
  applyState(out.state);
  if (out.drive && out.drive.ok === false && patch.brief != null) {
    toast(out.drive.error || "Saved on the board, not on Drive");
  } else if (out.drive?.rename?.renamed) {
    toast("Renamed on the board, Drive folder, and brief Doc");
  } else {
    toast("Saved");
  }
  if (opts.close) {
    closeDrawer();
    return;
  }
  if (state.openId && $("drawerBg").classList.contains("show")) openTask(id);
}
function driveToast(drive) {
  if (!drive) return "";
  if (drive.created) return ` · ${drive.created} Drive folder${drive.created === 1 ? "" : "s"} + brief`;
  if (drive.ready) return " · Drive folder + brief ready";
  if (drive.errors?.length) return " · Drive folder skipped";
  return "";
}
async function copyForClient(text) {
  const pack = String(text || "").trim();
  const ok = await copyText(pack);
  $("pasteModal")?.classList.remove("show");
  if (ok) {
    closeDrawer();
    toast("Copied for the client");
    return true;
  }
  showPaste(
    "Copy for the client",
    "Clipboard is blocked here. Select the text and copy, then Close.",
    pack
  );
  toast("Copy failed — select the text");
  return false;
}

async function sendToClient(ids) {
  if (!canOps()) {
    toast("Only Line Producer can send to the client");
    return;
  }
  const picked = state.db.tasks.filter((t) => ids.includes(t.id));
  const ready = picked.filter(isSendable);
  if (!ready.length) {
    toast("Send only works on Done / Storyboard / HTML ready projects");
    return;
  }
  const out = await api("/api/export-monday", { ids: ready.map((t) => t.id), role: me().role, actorId: me().id });
  if (out.error || !out.state) {
    toast(out.error || "Could not send");
    return;
  }
  applyState(out.state);
  const pack = (out.exported || []).map((row) => row.reply).join("\n\n");
  await copyForClient(pack);
}
async function exportMonday() {
  await sendToClient([...state.selected]);
}
function applyState(db, opts = {}) {
  state.db = db;
  state.finApi = null;
  state.finApiMonth = null;
  state.finApiLoading = null;
  state.selected = new Set([...state.selected].filter((id) => db.tasks.some((t) => t.id === id)));
  if (opts.render === false) return;
  render();
}

let liveSyncOn = false;
let syncAbort = null;

function unreadCount() {
  const N = window.LGNotices;
  if (!N || !state.db) return 0;
  return N.forPerson(state.db, me().id, true).length;
}

function cardIsDirty() {
  if (!$("drawerBg")?.classList.contains("show") || !state.openId) return false;
  const t = state.db?.tasks?.find((x) => x.id === state.openId);
  if (!t) return false;
  const active = document.activeElement;
  if (active && $("drawer")?.contains(active) && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) {
    return true;
  }
  if ($("stBrief") && $("stBrief").value !== (t.brief || "")) return true;
  if ($("stName") && String($("stName").value || "").replace(/\s+/g, " ").trim() !== t.name) return true;
  if ($("stComment") && String($("stComment").value || "").trim()) return true;
  if ($("stResult") && String($("stResult").value || "").trim() !== String(t.resultUrl || "").trim()) {
    return true;
  }
  if (canEditHelp()) {
    const now = JSON.stringify(readHelpFromCard($("stPerson")?.value || t.assigneeId));
    const was = JSON.stringify(helpEntries(t));
    if (now !== was) return true;
  }
  return false;
}

let noticeAudio = null;
const SOUND_KEY = "lg-notice-sound";
function loadSoundPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(SOUND_KEY) || "");
    const volume = Math.min(1, Math.max(0, Number(raw.volume)));
    return {
      on: raw.on !== false,
      volume: Number.isFinite(volume) ? volume : 0.7,
    };
  } catch {
    return { on: true, volume: 0.7 };
  }
}
let soundPrefs = loadSoundPrefs();
function saveSoundPrefs() {
  localStorage.setItem(SOUND_KEY, JSON.stringify(soundPrefs));
  paintSoundCtrl();
}
function soundOpen() {
  return $("soundPanel") && !$("soundPanel").hidden;
}
function setSoundOpen(open) {
  const panel = $("soundPanel");
  const btn = $("soundBtn");
  if (!panel || !btn) return;
  panel.hidden = !open;
  btn.setAttribute("aria-expanded", open ? "true" : "false");
}
function paintSoundCtrl() {
  const btn = $("soundBtn");
  const toggle = $("soundToggle");
  const vol = $("soundVol");
  const muted = !soundPrefs.on || soundPrefs.volume <= 0;
  if (btn) {
    btn.classList.toggle("is-off", muted);
    btn.setAttribute("aria-pressed", muted ? "false" : "true");
    btn.title = muted ? "Notice sound is off" : "Notice sound";
  }
  if (toggle) {
    toggle.textContent = muted ? "Sound off" : "Sound on";
    toggle.classList.toggle("is-on", !muted);
  }
  if (vol) vol.value = String(Math.round(soundPrefs.volume * 100));
}
function unlockNoticeSound() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return Promise.resolve();
  if (!noticeAudio) noticeAudio = new AC();
  if (noticeAudio.state === "suspended") return noticeAudio.resume().catch(() => {});
  return Promise.resolve();
}
function playNoticeSound(opts = {}) {
  if (!opts.preview && (!soundPrefs.on || soundPrefs.volume <= 0)) return;
  const level = Math.max(0.04, soundPrefs.volume);
  unlockNoticeSound().then(() => {
    try {
      if (!noticeAudio || noticeAudio.state !== "running") return;
      const t = noticeAudio.currentTime;
      const beep = (freq, at, dur, vol) => {
        const osc = noticeAudio.createOscillator();
        const gain = noticeAudio.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, t + at);
        gain.gain.setValueAtTime(0.0001, t + at);
        gain.gain.exponentialRampToValueAtTime(vol * level, t + at + 0.018);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + at + dur);
        osc.connect(gain);
        gain.connect(noticeAudio.destination);
        osc.start(t + at);
        osc.stop(t + at + dur + 0.02);
      };
      beep(880, 0, 0.12, 0.18);
      beep(1319, 0.14, 0.2, 0.16);
    } catch {
      /* autoplay blocked until a click on the desk */
    }
  });
}
["pointerdown", "keydown"].forEach((ev) => {
  document.addEventListener(ev, unlockNoticeSound, { capture: true });
});

function applyRemoteState(db) {
  const openId = state.openId;
  const drawerOpen = Boolean($("drawerBg")?.classList.contains("show") && openId);
  const dirty = cardIsDirty();
  const before = unreadCount();
  applyState(db);
  if (unreadCount() > before) {
    playNoticeSound();
    toast("New on the board");
  }
  if (!drawerOpen) return;
  const still = (db.tasks || []).some((t) => t.id === openId);
  if (!still) {
    closeDrawer();
    toast("This project was removed");
    return;
  }
  if (!dirty) openTask(openId);
}

function stopLiveSync() {
  liveSyncOn = false;
  if (syncAbort) {
    syncAbort.abort();
    syncAbort = null;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitUntilVisible() {
  if (!document.hidden) return Promise.resolve();
  return new Promise((resolve) => {
    const on = () => {
      if (document.hidden) return;
      document.removeEventListener("visibilitychange", on);
      resolve();
    };
    document.addEventListener("visibilitychange", on);
  });
}

async function liveSyncLoop() {
  while (liveSyncOn) {
    if (document.hidden) {
      await waitUntilVisible();
      continue;
    }
    if (!isStudioHost()) {
      stopLiveSync();
      return;
    }
    if (!state.db || $("loginGate")?.hidden === false) {
      await sleep(1000);
      continue;
    }
    const ctrl = new AbortController();
    syncAbort = ctrl;
    const rev = Number(state.db?.meta?.rev || 0) || 0;
    try {
      const res = await fetch(`/api/sync?rev=${encodeURIComponent(rev)}&wait=20`, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal: ctrl.signal,
      });
      const type = res.headers.get("content-type") || "";
      const out = type.includes("json") ? await res.json() : {};
      if (res.status === 401) {
        writeSession(null);
        showLogin();
        return;
      }
      if (out.error) {
        await sleep(2000);
        continue;
      }
      if (!out.unchanged && out.state) applyRemoteState(out.state);
    } catch (err) {
      if (err && err.name === "AbortError") continue;
      await sleep(2000);
    }
  }
}

function startLiveSync() {
  if (liveSyncOn) return;
  if (!isStudioHost()) return;
  liveSyncOn = true;
  liveSyncLoop();
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden && syncAbort) syncAbort.abort();
});

function inboxOpen() {
  return $("inboxPanel") && !$("inboxPanel").hidden;
}
function setInboxOpen(open) {
  const panel = $("inboxPanel");
  const btn = $("inboxBtn");
  if (!panel || !btn) return;
  panel.hidden = !open;
  btn.setAttribute("aria-expanded", open ? "true" : "false");
  if (open) renderInboxList();
}
function renderInbox() {
  const N = window.LGNotices;
  const countEl = $("inboxCount");
  const btn = $("inboxBtn");
  if (!countEl || !btn || !N || !state.db) return;
  const unread = N.forPerson(state.db, me().id, true);
  countEl.hidden = !unread.length;
  countEl.textContent = unread.length > 9 ? "9+" : String(unread.length);
  btn.classList.toggle("has-unread", unread.length > 0);
  $("inboxAll").hidden = !unread.length;
  if (inboxOpen()) renderInboxList();
}
function renderInboxList() {
  const N = window.LGNotices;
  const list = $("inboxList");
  if (!list || !N || !state.db) return;
  const unread = N.forPerson(state.db, me().id, true);
  if (!unread.length) {
    list.innerHTML = `<p class="inbox-empty">Nothing waiting for you.</p>`;
    return;
  }
  const groups = [];
  const map = new Map();
  for (const notice of unread) {
    if (!map.has(notice.kind)) {
      const group = { kind: notice.kind, items: [] };
      map.set(notice.kind, group);
      groups.push(group);
    }
    map.get(notice.kind).items.push(notice);
  }
  list.innerHTML = groups
    .map((group) => {
      const mark = (N.KINDS[group.kind] || {}).mark || "none";
      return `<div class="inbox-group">
        <div class="inbox-kind">${escapeHtml(N.labelOf(group.kind))} · ${group.items.length}</div>
        ${group.items
          .map(
            (n) => `<button type="button" class="inbox-item" data-id="${escapeHtml(n.id)}" data-task="${escapeHtml(n.taskId || "")}">
              <span class="notice-chip notice-${mark}">${escapeHtml(N.labelOf(n.kind))}</span>
              <span class="inbox-item-text">
                <strong>${escapeHtml(N.titleOf(n))}</strong>
                <small>${escapeHtml(N.detailOf(n))}</small>
              </span>
            </button>`
          )
          .join("")}
      </div>`;
    })
    .join("");
  list.querySelectorAll(".inbox-item").forEach((el) => {
    el.addEventListener("click", async () => {
      const taskId = el.dataset.task;
      setInboxOpen(false);
      await ackNotices({ ids: [el.dataset.id] });
      if (taskId) openTask(taskId);
    });
  });
}
async function ackNotices(payload) {
  const out = await api("/api/notices/read", { personId: me().id, ...payload });
  if (out.state) applyState(out.state);
}

function render() {
  if (!state.db) return;
  syncDirection();
  if (isClient() && state.view !== "report") state.view = "report";
  renderWho();
  renderChrome();
  renderInbox();
  renderToolbar();
  renderKpis();
  renderLoad();
  renderBoard();
}

$("monthPrev").addEventListener("click", () => setMonth(shiftMonth(state.month, -1)));
$("monthNext").addEventListener("click", () => setMonth(shiftMonth(state.month, 1)));
$("monthLabel").addEventListener("click", () => setMonth(calendarMonth()));

$("who").addEventListener("change", (e) => {
  const next = person(e.target.value);
  state.roleId = e.target.value;
  state.selected.clear();
  state.designerFilter = null;
  state.view = next?.role === "finance" ? "close" : next?.role === "client" ? "report" : "board";
  setInboxOpen(false);
  if (state.session) writeSession({ ...state.session, seatId: e.target.value });
  const account = accountByEmail(state.session?.email);
  if (account && !account.lockRole) {
    api("/api/seat", { seatId: e.target.value }).then((out) => {
      if (out?.state) applyState(out.state);
    });
    return;
  }
  render();
});
$("inboxBtn")?.addEventListener("click", (e) => {
  e.stopPropagation();
  setSoundOpen(false);
  setInboxOpen(!inboxOpen());
});
$("inboxAll")?.addEventListener("click", async (e) => {
  e.stopPropagation();
  await ackNotices({ all: true });
  setInboxOpen(true);
});
$("soundBtn")?.addEventListener("click", (e) => {
  e.stopPropagation();
  setInboxOpen(false);
  setSoundOpen(!soundOpen());
});
$("soundToggle")?.addEventListener("click", (e) => {
  e.stopPropagation();
  soundPrefs.on = !soundPrefs.on;
  if (soundPrefs.on && soundPrefs.volume <= 0) soundPrefs.volume = 0.7;
  saveSoundPrefs();
  if (soundPrefs.on) playNoticeSound({ preview: true });
});
let soundPreviewTimer = 0;
$("soundVol")?.addEventListener("input", () => {
  const n = Number($("soundVol").value);
  soundPrefs.volume = Math.min(1, Math.max(0, (Number.isFinite(n) ? n : 70) / 100));
  soundPrefs.on = soundPrefs.volume > 0;
  saveSoundPrefs();
  clearTimeout(soundPreviewTimer);
  soundPreviewTimer = setTimeout(() => {
    if (soundPrefs.on && soundPrefs.volume > 0) playNoticeSound({ preview: true });
  }, 120);
});
document.addEventListener("click", (e) => {
  if (!$("inboxWrap")?.contains(e.target)) setInboxOpen(false);
  if (!$("soundWrap")?.contains(e.target)) setSoundOpen(false);
});
paintSoundCtrl();
$("signOut").addEventListener("click", () => {
  api("/api/logout", {});
  writeSession(null);
  state.roleId = "manager";
  state.view = "board";
  state.selected.clear();
  state.designerFilter = null;
  state.openId = null;
  $("drawerBg").classList.remove("show");
  if (isHoursPage()) {
    location.replace("/");
    return;
  }
  showLogin();
});
$("navMgx")?.addEventListener("click", () => {
  if (isClient()) return;
  if (state.view === "close" || state.view === "team") state.view = "board";
  setDirection("mgx");
});
$("navPlay")?.addEventListener("click", () => {
  if (isClient()) return;
  if (state.view === "close" || state.view === "team") state.view = "board";
  setDirection("playables");
});
$("navClose").addEventListener("click", () => {
  if (!isFinance()) return;
  state.view = "close";
  render();
});
$("navTeam").addEventListener("click", () => {
  if (!isFinance()) return;
  state.view = "team";
  render();
});
$("delCancel").onclick = () => $("delModal").classList.remove("show");
$("delConfirm").onclick = () => confirmDeletePerson();
$("delMove").addEventListener("change", () => {
  $("delConfirm").disabled = !$("delMove").value;
});
$("delModal").addEventListener("click", (e) => {
  if (e.target === $("delModal")) $("delModal").classList.remove("show");
});
$("pasteClose").onclick = () => $("pasteModal").classList.remove("show");
$("pasteCopy").onclick = async () => {
  const btn = $("pasteCopy");
  if (btn?.classList.contains("is-busy")) return;
  setBusy(btn, true, "Copying…");
  try {
    await copyForClient($("pasteText").value);
  } finally {
    setBusy(btn, false);
  }
};
$("pasteModal").addEventListener("click", (e) => {
  if (e.target === $("pasteModal")) $("pasteModal").classList.remove("show");
});
$("taskDelCancel")?.addEventListener("click", closeTaskDelete);
$("taskDelConfirm")?.addEventListener("click", confirmDeleteTasks);
$("taskDelModal")?.addEventListener("click", (e) => {
  if (e.target === $("taskDelModal")) closeTaskDelete();
});
$("createTaskCancel")?.addEventListener("click", closeCreateTask);
$("createTaskGo")?.addEventListener("click", submitCreateTask);
$("createTaskName")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitCreateTask();
});
$("createTaskModal")?.addEventListener("click", (e) => {
  if (e.target === $("createTaskModal")) closeCreateTask();
});
$("emailCancel").onclick = () => $("emailModal").classList.remove("show");
$("emailApply").onclick = async () => {
  const go = $("emailApply");
  if (go?.classList.contains("is-busy")) return;
  const err = $("emailErr");
  const wait = $("emailWait");
  if (err) err.textContent = "";
  const text = String($("emailText")?.value || "");
  if (!text.trim()) {
    if (err) err.textContent = "Paste NAME 0.3 shift, one per line";
    return;
  }
  if (wait) wait.hidden = false;
  setBusy(go, true, "Adding…");
  const cancel = $("emailCancel");
  if (cancel) cancel.disabled = true;
  let out = {};
  try {
    out = await api("/api/parse-email", {
      text,
      month: state.month,
      role: me().role,
      actorId: me().id,
    });
  } finally {
    if (wait) wait.hidden = true;
    setBusy(go, false);
    if (cancel) cancel.disabled = false;
  }
  if (out.error || !out.state) {
    if (err) err.textContent = out.error || "Could not create tasks";
    toast(out.error || "Could not create tasks");
    return;
  }
  applyState(out.state);
  $("emailModal").classList.remove("show");
  $("emailText").value = "";
  toast(
    `On the board: ${out.added || 0} new · ${out.updated || 0} hours updated. Drive and Excel catch up in the background.`
  );
};
$("drawerBg").addEventListener("click", (e) => {
  if (e.target === $("drawerBg")) closeDrawer();
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if ($("taskDelModal")?.classList.contains("show")) {
    closeTaskDelete();
    return;
  }
  if ($("pasteModal")?.classList.contains("show")) {
    $("pasteModal").classList.remove("show");
    return;
  }
  if ($("createTaskModal")?.classList.contains("show")) {
    closeCreateTask();
    return;
  }
  if ($("emailModal")?.classList.contains("show")) {
    $("emailModal").classList.remove("show");
    return;
  }
  if ($("drawerBg")?.classList.contains("show")) closeDrawer();
});

probeStudioApi()
  .then(async () => {
    if (!isStudioHost()) {
      showNeedServer();
      return;
    }
    const meOut = await api("/api/me");
    if (!meOut || meOut.error || !meOut.session) {
      showLogin();
      return;
    }
    applyState(meOut.state, { render: false });
    state.month = localStorage.getItem(MONTH_KEY) || calendarMonth() || meOut.state?.meta?.month || "2026-10";
    if (!applySession(meOut.session)) {
      showLogin();
      return;
    }
    if ((meOut.session.role === "client" || meOut.session.email === "superplay@lg-board") && !isHoursPage()) {
      location.replace("/hours");
      return;
    }
    enterStudio();
    render();
  })
  .catch(() => {
    if (isStudioHost()) showLogin();
    else showNeedServer();
  });
