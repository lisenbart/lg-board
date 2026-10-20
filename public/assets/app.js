const STATUS = {
  quote: { label: "Quote", cls: "status-new", order: 0 },
  new: { label: "Ready to Start", cls: "status-new", order: 1 },
  wip: { label: "WIP", cls: "status-wip", order: 2 },
  revision: { label: "Need Fixing", cls: "status-revision", order: 3 },
  tlcheck: { label: "TL Check", cls: "status-tlcheck", order: 4 },
  check: { label: "Check", cls: "status-tlcheck", order: 4 },
  done: { label: "Done", cls: "status-done", order: 5 },
  approve: { label: "Senior Approval", cls: "status-approve", order: 6 },
  closed: { label: "Closed", cls: "status-closed", order: 7 },
  clientart: { label: "Sent", cls: "status-approve", order: 3 },
  finalart: { label: "Final art", cls: "status-revision", order: 4 },
  artready: { label: "Art ready", cls: "status-done", order: 4.5 },
  storyboard: { label: "Check", cls: "status-tlcheck", order: 4 },
  build: { label: "Art ready", cls: "status-done", order: 4.5 },
  htmlready: { label: "Done", cls: "status-done", order: 5 },
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

const MGX_OPS_STATUSES = ["new", "wip", "revision", "tlcheck", "done", "closed"];
const STATUS_BY_ROLE = {
  designer: ["wip", "tlcheck"],
  teamlead: ["wip", "tlcheck", "done"],
  manager: MGX_OPS_STATUSES.slice(),
  finance: MGX_OPS_STATUSES.slice(),
  art_director: ["new", "wip", "check", "artready"],
  programmer: ["wip", "done"],
  client: [],
};
const PLAY_OPS_STATUSES = ["new", "wip", "check", "clientart", "revision", "finalart", "artready", "done", "closed"];
const PLAY_STATUS_BY_ROLE = {
  art_director: ["wip", "check", "artready"],
  programmer: ["wip", "done"],
  designer: [],
  teamlead: [],
  manager: PLAY_OPS_STATUSES.slice(),
  finance: PLAY_OPS_STATUSES.slice(),
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
const CLIENTS = [{ id: "superplay", label: "SuperPlay" }];

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
    blurb: "SuperPlay",
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
  hoursDir: null,
  hoursClient: "superplay",
  presence: {},
  cardOpenedStamp: "",
  cardStale: false,
  month: "2026-10",
  teamDrafts: {},
  teamPins: {},
  cardDirty: null,
  commitCard: null,
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
  driveQueued: {},
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
    /^\/(superplay|hours)\/?$/.test(location.pathname)
  );
}
function isHoursView() {
  return isClient() || isHoursPage() || (isFinance() && state.view === "report");
}
function clientLink() {
  return `${location.origin}/superplay`;
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
  document.title = isHoursPage() ? "SuperPlay — Lisenbart Board" : "Lisenbart Board";
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
    <form id="loginForm" class="login-form">
      <button type="button" class="btn ghost login-back" id="loginBack">Back</button>
      <label class="login-pin-lab" for="loginPin">PIN</label>
      <input id="loginPin" class="login-pin" type="password" inputmode="numeric" maxlength="8" autocomplete="current-password" />
      ${error ? `<p class="login-err">${escapeHtml(error)}</p>` : ""}
      <button type="submit" class="btn primary login-go" id="loginGo" disabled>Open</button>
    </form>
  `;
  $("loginBack")?.addEventListener("click", () => showStudioRoster());
  $("loginForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    submitDoorLogin();
  });
  bindLoginGo();
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
  $("loginTitle").textContent = isHoursPage() ? "SuperPlay" : "Client";
  $("loginLead").textContent = isHoursPage()
    ? "Type your name, then the SuperPlay PIN."
    : "Type your name, then the PIN.";
  document.title = isHoursPage() ? "SuperPlay — Lisenbart Board" : "Client — Lisenbart Board";
  $("loginAccounts").innerHTML = `
    <form id="loginForm" class="login-form">
      <button type="button" class="btn ghost login-back" id="loginBack">Back</button>
      <label class="login-pin-lab" for="loginEmail">Login</label>
      <input id="loginEmail" class="login-pin login-email" type="text" autocomplete="username" />
      <label class="login-pin-lab" for="loginPin">Password</label>
      <input id="loginPin" class="login-pin" type="password" maxlength="32" autocomplete="current-password" />
      ${error ? `<p class="login-err">${escapeHtml(error)}</p>` : ""}
      <button type="submit" class="btn primary login-go" id="loginGo" disabled>Open</button>
    </form>
  `;
  $("loginBack")?.addEventListener("click", loginBackHome);
  $("loginForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    submitDoorLogin();
  });
  bindLoginGo();
  $("loginEmail")?.focus();
}
async function submitDoorLogin(seatId) {
  const door = state.loginDoor || (isHoursPage() ? "client" : "studio");
  if (!seatId && $("loginGo")?.disabled) return;
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
    location.replace("/superplay");
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
  if (!p) return "";
  return displayName(p) || p.name || "";
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
  const n = Number(String(raw ?? "").trim().replace(/,/g, "."));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 1000) / 1000;
}
function fmtDeskNum(n) {
  if (n === null || n === undefined || n === "") return "";
  const x = Number(n);
  if (!Number.isFinite(x)) return "";
  return String(x).replace(".", ",");
}
function deskNumInput(cls, id, value, title) {
  return `<span class="num-step">
      <input class="${cls}" data-id="${escapeHtml(id)}" type="text" inputmode="decimal" maxlength="6" lang="uk" value="${escapeHtml(fmtDeskNum(value))}" title="${escapeHtml(title)}" />
      <span class="num-step-btns">
        <button type="button" class="num-step-up" tabindex="-1" aria-label="Up"></button>
        <button type="button" class="num-step-down" tabindex="-1" aria-label="Down"></button>
      </span>
    </span>`;
}
function stepDeskNum(el, dir, step) {
  const size = Number(step) > 0 ? Number(step) : 1;
  const n = parseShifts(el.value) ?? 0;
  const next = Math.max(0, Math.round((n + dir * size) * 10) / 10);
  el.value = fmtDeskNum(next);
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
function playableAdSplits(t) {
  return helpEntries(t).filter((row) => {
    const role = person(row.id)?.role;
    return !role || role === "art_director";
  });
}
function playableDevSplits(t) {
  const who = String(t?.programmerId || "");
  const seen = new Set();
  const rows = [];
  for (const row of t?.programmerHelp || []) {
    const id = String(row?.id || "").trim();
    const hours = roundHours(row?.hours);
    if (!id || id === who || hours <= 0 || seen.has(id)) continue;
    seen.add(id);
    rows.push({ id, hours });
  }
  for (const row of helpEntries(t)) {
    if (person(row.id)?.role === "programmer" && row.id !== who && !seen.has(row.id)) {
      seen.add(row.id);
      rows.push(row);
    }
  }
  return rows;
}
function hoursOwned(t) {
  if (isPlayables(t)) return roundHours(t?.assigneeHours);
  return Math.max(0, Math.round((hoursOf(t) - helpHoursTotal(t)) * 10) / 10);
}
function playableAdId(t) {
  const id = String(t?.assigneeId || "");
  if (!id) return "";
  if (id === String(t?.programmerId || "")) return "";
  const role = person(id)?.role;
  if (role && role !== "art_director") return "";
  return id;
}
function hoursForPerson(t, personId) {
  const id = String(personId || "");
  if (!id) return 0;
  if (isPlayables(t)) {
    const p = person(id);
    if (p?.role === "manager") {
      const ph = roundHours(t?.producerHours);
      if (ph) return ph;
      return playableCrewTotal(t);
    }
    if (id === String(t?.programmerId || "")) return roundHours(t?.programmerHours);
    if (id === String(t?.motionId || "")) return roundHours(t?.motionHours);
    if (id === playableAdId(t)) return hoursOwned(t);
    const split =
      playableDevSplits(t).find((row) => row.id === id) ||
      playableAdSplits(t).find((row) => row.id === id) ||
      helpEntries(t).find((row) => row.id === id);
    return split?.hours || 0;
  }
  if (id === String(t?.assigneeId || "")) return hoursOwned(t);
  return helpEntries(t).find((row) => row.id === id)?.hours || 0;
}
function helpedOn(t, personId) {
  const id = String(personId || "");
  if (!id) return false;
  if (helpEntries(t).some((row) => row.id === id)) return true;
  return isPlayables(t) && playableDevSplits(t).some((row) => row.id === id);
}
function canEditHelp() {
  return canAssign() || canOps();
}
function canEditPlayableCrew() {
  return canOps();
}
function playableCrewTotal(t) {
  const artH = roundHours(t?.assigneeHours);
  const adH = playableAdSplits(t).reduce((s, row) => s + row.hours, 0);
  const progH = roundHours(t?.programmerHours);
  const devH = playableDevSplits(t).reduce((s, row) => s + row.hours, 0);
  const motionH = roundHours(t?.motionHours);
  return roundHours(artH + adH + progH + devH + motionH);
}
function playableStudioBuffer(t) {
  if (t?.studioBuffer != null && t.studioBuffer !== "") return roundHours(t.studioBuffer);
  return Math.max(0, roundHours(hoursOf(t) - playableCrewTotal(t)));
}
function playableDeskTotal(t) {
  return roundHours(playableCrewTotal(t) + playableStudioBuffer(t));
}
function deskHours(t) {
  if (isPlayables(t)) {
    if (isPerformer()) return hoursForPerson(t, me().id);
    if (isFinance()) return playableDeskTotal(t);
    const crew = playableCrewTotal(t);
    if (crew) return crew;
  }
  return hoursOf(t);
}
function playableCardMeta(t) {
  const crew = playableCrewTotal(t);
  const billed = playableDeskTotal(t);
  const mineH = hoursForPerson(t, me().id);
  if (isFinance()) return `${billed || 0} h billed · ${crew || 0} h crew`;
  if (canOps()) return crew ? `${crew} h crew` : "";
  if (mineH) return `${mineH} h yours`;
  return "";
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
function canAssignPlayable() {
  return canOps();
}
function statusText(key, t) {
  if (t && isPlayables(t)) {
    const playKey = playableStatusKey({ studioStatus: key, department: t.department, direction: t.direction });
    if (playKey === "new") return "Ready";
    if (playKey === "approve") return "Send";
    if (playKey === "revision") return "Need Fixing";
    if (playKey === "clientart") return "Sent";
    return STATUS[playKey]?.label || STATUS[key]?.label || key;
  }
  return STATUS[key]?.label || key;
}
function isExecView() {
  return isDesigner() || isTeamLead() || isArtDirector() || isProgrammer();
}
function isSendable(t) {
  if (!t) return false;
  if (isPlayables(t)) {
    const st = playableStatusKey(t);
    const hasLink = Boolean(String(t.resultUrl || "").trim());
    if (st === "check") return hasLink;
    return st === "done" && hasLink;
  }
  return t.studioStatus === "done" && Boolean(String(t.resultUrl || "").trim());
}
function canPasteResult(t) {
  if (canOps()) return true;
  if (!t) return false;
  if (isPlayables(t)) {
    if (isProgrammer() && String(t.programmerId || "") === String(me().id) && playableInHtml(t)) return true;
    if (isArtDirector() && playableAdId(t) === me().id && !playableInHtml(t)) return true;
    return false;
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
  if (p.role === "manager") {
    used.lp = (used.lp || 0) + 1;
    return `LP ${used.lp}`;
  }
  if (p.role === "teamlead") {
    used.tl = (used.tl || 0) + 1;
    return `TL ${used.tl}`;
  }
  if (p.role === "programmer") {
    used.dev = (used.dev || 0) + 1;
    return `DEV ${used.dev}`;
  }
  if (p.role === "art_director") {
    used.art = (used.art || 0) + 1;
    return `ARTD ${used.art}`;
  }
  if (state.direction === "playables") return "MOTION";
  used.md = (used.md || 0) + 1;
  return `MD ${used.md}`;
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

function toast(msg, ms) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(el._hide);
  el._hide = setTimeout(() => el.classList.remove("show"), ms || 3200);
}

function setBusy(el, on, label) {
  if (!el) return;
  if (on) {
    if (el.dataset.idleLabel == null) el.dataset.idleLabel = el.textContent;
    el.dataset.idleDisabled = el.disabled ? "1" : "0";
    el.disabled = true;
    el.classList.add("is-busy");
    el.setAttribute("aria-busy", "true");
    if (label) el.textContent = label;
  } else {
    el.classList.remove("is-busy");
    el.removeAttribute("aria-busy");
    el.disabled = el.dataset.idleDisabled === "1";
    delete el.dataset.idleDisabled;
    if (el.dataset.idleLabel != null) {
      el.textContent = el.dataset.idleLabel;
      delete el.dataset.idleLabel;
    }
  }
}

function setIdleEnabled(el, on) {
  if (!el || el.classList.contains("is-busy")) return;
  el.disabled = !on;
}

function pinLooksReady(pin, door) {
  const got = String(pin || "").trim();
  if (door === "client") return got.length >= 4;
  return /^\d{4,8}$/.test(got);
}

function bindLoginGo() {
  const pin = $("loginPin");
  const email = $("loginEmail");
  const go = $("loginGo");
  const sync = () => {
    const pinOk = pinLooksReady(pin?.value, state.loginDoor);
    const emailOk = state.loginDoor !== "client" || String(email?.value || "").trim();
    setIdleEnabled(go, pinOk && emailOk);
  };
  pin?.addEventListener("input", sync);
  pin?.addEventListener("change", sync);
  email?.addEventListener("input", sync);
  email?.addEventListener("change", sync);
  sync();
  setTimeout(sync, 80);
}

function refreshCreateGo() {
  const name = String($("createTaskName")?.value || "").replace(/\s+/g, " ").trim();
  setIdleEnabled($("createTaskGo"), Boolean(name));
}

function refreshEmailGo() {
  setIdleEnabled($("emailApply"), Boolean(String($("emailText")?.value || "").trim()));
}

async function api(path, payload, opts = {}) {
  const ctrl = new AbortController();
  const ms = opts.timeout || (payload ? 12000 : 8000);
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
function searchHtml() {
  const on = Boolean(String(state.search || "").trim());
  return `<label class="search-wrap">
    <input class="search" placeholder="Search project" />
    <button type="button" class="search-clear" ${on ? "" : "hidden"} aria-label="Clear search">×</button>
  </label>`;
}
function bindSearch() {
  const box = $("toolbar")?.querySelector(".search");
  const clear = $("toolbar")?.querySelector(".search-clear");
  if (!box) return;
  box.value = state.search || "";
  box.addEventListener("input", () => {
    state.search = box.value;
    state.searchFocus = true;
    state.searchCaret = box.selectionStart;
    render();
  });
  clear?.addEventListener("click", () => {
    state.search = "";
    state.searchFocus = false;
    state.searchCaret = 0;
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
        const want = "done";
        if (t.studioStatus !== want) return false;
      } else if (state.designerFilter === "unassigned") {
        if (isPlayables(t) ? playableAdId(t) || t.programmerId : t.assigneeId) return false;
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
  const p = me();
  const mail = $("whoMail");
  const sel = $("who");
  const out = $("signOut");
  const hint = $("roleHint");
  const ident = mail?.closest(".who-id");
  const badge = jobMeta(p);
  const client = isClient();
  if (ident) ident.hidden = client;
  mail.hidden = client;
  mail.textContent = client ? "" : whoLabel(p);
  out.hidden = false;
  sel.hidden = true;
  sel.innerHTML = "";
  if (hint) {
    hint.hidden = client || !p;
    hint.textContent = client ? "" : badge.title || "";
    hint.className = `who-role who-role-${(badge.code || "").toLowerCase()}`;
  }
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
  state.hoursDir = null;
  localStorage.setItem(MONTH_KEY, ym);
  render();
}

function renderChrome() {
  syncDirection();
  $("financeNav").hidden = !isFinance();
  if ($("clientsNav")) $("clientsNav").hidden = !isFinance();
  if ($("inboxWrap")) $("inboxWrap").hidden = isClient();
  if ($("soundWrap")) {
    const hideSound = isClient() || isHoursPage();
    $("soundWrap").hidden = hideSound;
    if (hideSound) setSoundOpen(false);
  }
  document.title = isHoursView() ? "SuperPlay — Lisenbart Board" : "Lisenbart Board";
  const title = document.querySelector(".board-title");
  const boardLogo = $("boardLogo");
  const clientHours = isClient() || isHoursPage();
  if (title) {
    title.hidden = clientHours;
    title.textContent = clientHours
      ? ""
      : isHoursView()
        ? "SuperPlay"
        : DIR_LABEL[state.direction] || DIR_LABEL.mgx;
  }
  if (boardLogo) boardLogo.hidden = !clientHours;
  const pill = document.querySelector(".top-row > .pill");
  if (pill) {
    const play = state.direction === "playables";
    pill.className = play ? "pill dep-playables" : "pill dep-MGX";
    pill.textContent = play ? "Playables" : "MGX";
    pill.hidden = isHoursView();
  }
  const mgxNav = $("navMgx");
  const playNav = $("navPlay");
  const onBoard = state.view !== "close" && state.view !== "team" && state.view !== "report";
  if (mgxNav) {
    mgxNav.hidden = isClient() || !canSeeDirection("mgx");
    mgxNav.classList.toggle("active", onBoard && state.direction === "mgx");
  }
  if (playNav) {
    playNav.hidden = isClient() || !canSeeDirection("playables");
    playNav.classList.toggle("active", onBoard && state.direction === "playables");
  }
  $("navClose")?.classList.toggle("active", isFinance() && state.view === "close");
  $("navTeam")?.classList.toggle("active", isFinance() && state.view === "team");
  $("navClientSuperplay")?.classList.toggle("active", isFinance() && state.view === "report");
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
  $("sideFoot").innerHTML = "";
  ensureDriveStatus();

  const tabs = [];
  if (isClient()) {
    tabs.push({ id: "report", label: "SuperPlay" });
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
      tabs.push({ id: "report", label: "SuperPlay" });
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
        if (state.view === "report") state.hoursClient = "superplay";
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
    $("toolbar").innerHTML = searchHtml();
    bindSearch();
    return;
  }
  if (state.view === "excel") {
    const drive = state.db?.meta?.driveLiveExcel || "";
    $("toolbar").innerHTML = `
      ${isFinance() ? `<button type="button" class="btn" id="btnDrivePull">Read Drive</button>` : ""}
      ${drive ? `<a class="btn" href="${escapeHtml(drive)}" target="_blank" rel="noreferrer">Open on Drive</a>` : ""}
      ${searchHtml()}
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
      ${searchHtml()}
    `;
  } else {
    $("toolbar").innerHTML = `
      ${isFinance() ? driveStrip() : ""}
      ${canOps() && state.view === "board" ? `<button type="button" class="btn primary" id="btnCreateTask">Create task</button>` : ""}
      <button class="btn orange" id="btnEmail">${state.direction === "playables" ? "Hours list" : "Shift email"}</button>
      ${drive ? `<a class="btn" href="${escapeHtml(drive)}" target="_blank" rel="noreferrer">Open Drive</a>` : ""}
      <button class="btn green" id="btnExport" ${n ? "" : "disabled"}>Send to client (${n})</button>
      ${searchHtml()}
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
    refreshEmailGo();
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
  refreshCreateGo();
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
    closeDrawer({ force: true });
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
    refreshCreateGo();
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
  if (out.task?.id) {
    if (out.drive?.queued) state.driveQueued[out.task.id] = true;
    openTask(out.task.id);
  }
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
      ["wip", "revision", "tlcheck", "check", "finalart"].includes(playableStatusKey(t))
    ).length;
    $("kpis").innerHTML = `
      <div class="kpi"><b>${tasks.length}</b><span>assigned to me</span></div>
      <div class="kpi"><b>${active}</b><span>in progress</span></div>
      <div class="kpi"><b>${hours.toFixed(1)} h</b><span>my hours this month</span></div>
    `;
    return;
  }
  const month = monthTasks();
  const hours = month.reduce((s, t) => s + deskHours(t), 0);
  const readyKey = "done";
  const readyLabel = "Done";
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
  if (isPlayables(t)) {
    const ad = playableAdId(t);
    const bits = [];
    if (ad) {
      bits.push(personCell(ad));
      const ads = playableAdSplits(t);
      if (ads.length) {
        const names = ads.map((row) => person(row.id)?.name || row.id).join(", ");
        bits.push(`<small class="help-mark" title="${escapeHtml(names)}">+${ads.length}</small>`);
      }
    }
    if (t.programmerId) {
      bits.push(personCell(t.programmerId));
      const devs = playableDevSplits(t);
      if (devs.length) {
        const names = devs.map((row) => person(row.id)?.name || row.id).join(", ");
        bits.push(`<small class="help-mark" title="${escapeHtml(names)}">+${devs.length}</small>`);
      }
    }
    if (t.motionId && t.motionId !== ad && t.motionId !== t.programmerId) {
      bits.push(personCell(t.motionId));
    }
    if (!bits.length) return personCell("");
    if (bits.length === 1) return bits[0];
    return `<span class="who-stack">${bits.join("")}</span>`;
  }
  const base = personCell(t.assigneeId);
  const extra = [];
  const ads = helpEntries(t);
  if (ads.length) {
    const names = ads.map((row) => person(row.id)?.name || row.id).join(", ");
    extra.push(`<small class="help-mark" title="${escapeHtml(names)}">+${ads.length}</small>`);
  }
  if (!extra.length) return base;
  return `<span class="who-stack">${base}${extra.join("")}</span>`;
}
function normalizeDriveFolder(url) {
  const raw = String(url || "");
  const open = raw.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/i);
  if (open) return `https://drive.google.com/drive/folders/${open[1]}`;
  const fold = raw.match(/https:\/\/drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/[a-zA-Z0-9_-]+/i);
  return fold ? fold[0] : "";
}
function driveFolderIn(text) {
  return normalizeDriveFolder(text);
}
function labeledWorkFolder(text) {
  const m = String(text || "").match(
    /(?:working folder|pls work here|please work here|work here|pls work)[:\s]*\n*(https:\/\/drive\.google\.com\/(?:drive\/(?:u\/\d+\/)?folders\/|open\?id=)[a-zA-Z0-9_-]+)/i
  );
  return m ? normalizeDriveFolder(m[1]) : "";
}
function taskFolder(t) {
  return String(t?.folderUrl || "").trim();
}
function workFolder(t) {
  return labeledWorkFolder(t?.brief);
}
function packFolderButtons(t) {
  const task = taskFolder(t);
  const work = workFolder(t);
  const brief = t.docUrl
    ? `<a class="btn pack-brief" href="${escapeHtml(t.docUrl)}" target="_blank" rel="noreferrer">Open brief</a>`
    : "";
  const taskBtn = task
    ? `<a class="btn pack-folder" href="${escapeHtml(task)}" target="_blank" rel="noreferrer">Task folder</a>`
    : "";
  const workBtn = work
    ? `<a class="btn pack-work" href="${escapeHtml(work)}" target="_blank" rel="noreferrer">Working folder</a>`
    : `<button type="button" class="btn pack-work" disabled title="No working folder in the brief">Working folder</button>`;
  return { brief, taskBtn, workBtn, task, work };
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
  const pack = packFolderButtons(t);
  const retry = canOps() && t.source === "portal" && !pack.task
    ? `<button type="button" class="btn" id="ensureDrive">Create Drive folder</button>`
    : "";
  const actions = `<footer class="pin-actions">${pack.brief}${pack.taskBtn}${pack.workBtn}${retry}</footer>`;
  const warn = canOps() && t.source === "portal" && !pack.task
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
const MAX_SHOT_EDGE = 1920;
const MAX_SHOT_FILE = 6 * 1024 * 1024;
const MAX_NOTE_BYTES = 18_000_000;
function loadShotImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("bad image"));
    img.src = src;
  });
}
function canvasShot(img) {
  let w = img.naturalWidth || img.width;
  let h = img.naturalHeight || img.height;
  if (!w || !h) return null;
  if (w > MAX_SHOT_EDGE || h > MAX_SHOT_EDGE) {
    const scale = MAX_SHOT_EDGE / Math.max(w, h);
    w = Math.max(1, Math.round(w * scale));
    h = Math.max(1, Math.round(h * scale));
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  let data = canvas.toDataURL("image/jpeg", 0.82);
  if (data.length > 1_400_000) data = canvas.toDataURL("image/jpeg", 0.7);
  return { mime: "image/jpeg", data };
}
function readShotFile(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ mime: file.type || "image/png", data: String(reader.result || "") });
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}
async function fileToShot(file) {
  if (!file || !String(file.type || "").startsWith("image/")) return null;
  if (file.size > MAX_SHOT_FILE) {
    toast("Screenshot is over 6 MB");
    return null;
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await loadShotImage(url);
    const small =
      file.size <= 350000 &&
      (img.naturalWidth || 0) <= MAX_SHOT_EDGE &&
      (img.naturalHeight || 0) <= MAX_SHOT_EDGE;
    if (small) return await readShotFile(file);
    return canvasShot(img) || (await readShotFile(file));
  } catch {
    return readShotFile(file);
  } finally {
    URL.revokeObjectURL(url);
  }
}
function noteError(err) {
  const text = String(err || "");
  if (/payload too large|too large together/i.test(text)) {
    return "Screenshots are too large together. Remove a few and Save again.";
  }
  if (/timed out/i.test(text)) {
    return "Screenshots took too long to send. Try fewer, then Save again.";
  }
  if (/could not read those screenshots/i.test(text)) {
    return "Could not read those screenshots. Try PNG/JPG under 6 MB each.";
  }
  return text || "Could not add note";
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
          <button class="btn" type="button" id="addNote" disabled>Add note</button>
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
  const html = play && playableInHtml(t);
  const title = !play ? "Result" : html ? "HTML" : "Storyboard";
  const placeholder = !play ? "Paste finished file link" : html ? "Paste HTML / playable link" : "Paste storyboard / board link";
  const hint = !play
    ? performer
      ? "The file, not the folder."
      : "Needed before Send to client."
    : html
      ? "Done needs this HTML link."
      : "Paste the board when it is ready. LP sends this link.";
  const body = canPaste
    ? `<input id="stResult" value="${escapeHtml(t.resultUrl || "")}" placeholder="${placeholder}" />
        <p class="io-hint">${hint}</p>`
    : t.resultUrl
      ? `<a class="pin-link" href="${escapeHtml(t.resultUrl)}" target="_blank" rel="noreferrer">${html ? "Open HTML" : "Open storyboard"}</a>`
      : `<p class="io-empty">Waiting for ${escapeHtml(person(html ? t.programmerId : t.assigneeId)?.name || "designer")}</p>`;
  const board = play ? String(t.storyboardUrl || "").trim() : "";
  const boardLink = html && board
    ? `<p class="io-hint"><a class="pin-link" href="${escapeHtml(board)}" target="_blank" rel="noreferrer">Open storyboard</a></p>`
    : "";
  return `<section class="io io-result${performer ? " is-focus" : ""}">
      <h3>${title}</h3>
      ${body}
      ${boardLink}
    </section>`;
}
function hasDriveDoc(t) {
  return Boolean(String(t?.docUrl || "").trim());
}
function hasDriveFolder(t) {
  return Boolean(taskFolder(t));
}
function cardJob(t) {
  const play = isPlayables(t);
  const adId = play ? playableAdId(t) : t.assigneeId;
  const role = me().role;
  const mine = adId === me().id;
  const hasResult = Boolean(String(t.resultUrl || "").trim());
  const who = person(adId);
  const name = who ? displayName(who) : "";
  if (play) return playableCardJob(t, { role, mine, hasResult, name });
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
    return { tone: "wait", title: "Waiting for TL", body: `${name || "Designer"} submitted for TL Check. If they are away, set Done yourself. Send only after Done.` };
  }
  if (!t.assigneeId) {
    return { tone: "wait", title: "Waiting for TL", body: "Set hours if needed. Team Lead assigns. If MD or TL are away, set the status yourself. You send only after Done." };
  }
  if (t.studioStatus === "revision") {
    return { tone: "wait", title: "In Need Fixing", body: `${name || "Designer"} is fixing. If they are away, set the status yourself. Send only after Done.` };
  }
  return {
    tone: "wait",
    title: "In progress",
    body: `${name || "Designer"} is on this. If they are away, set the status yourself. Send only when status is Done and the result link is pasted.`,
  };
}
function playableCardJob(t, { role, mine, hasResult, name }) {
  const st = playableStatusKey(t);
  const prog = person(t.programmerId);
  const progName = prog ? displayName(prog) : "";
  const html = playableInHtml(t);
  if (role === "art_director") {
    if (!mine && helpedOn(t, me().id)) {
      return { tone: "ok", title: "You helped", body: `${hoursForPerson(t, me().id)}h on this playable. ${name || "AD"} owns the card.` };
    }
    if (st === "closed") return { tone: "ok", title: "Closed", body: "Client accepted. This playable is finished." };
    if (st === "approve") return { tone: "ok", title: "Sent to client", body: "LP already sent the HTML. Nothing else on this card." };
    if (st === "artready") return { tone: "wait", title: "Art ready", body: "DEV starts HTML from here. You are done with this stage." };
    if (st === "done") return { tone: "wait", title: "Waiting for LP", body: "HTML is in. Line Producer sends it." };
    if (html) return { tone: "wait", title: "Waiting for DEV / LP", body: "Art is done. Programmer builds HTML. LP sends it." };
    if (st === "clientart") return { tone: "wait", title: "Sent", body: "Storyboard is with the client. LP sets Need Fixing if they bounce it, or Final art when they approve." };
    if (st === "check") return { tone: "wait", title: "Waiting for LP", body: "Storyboard is ready. LP sends it. Only LP talks to the client." };
    if (st === "finalart") return { tone: "do", title: "Final art", body: "Finish art, then Art ready so DEV can start HTML." };
    if (st === "revision") return { tone: "fix", title: "Need Fixing", body: "Fix the storyboard, set WIP, paste the new board link, then Check." };
    if (st === "wip") return { tone: "do", title: "WIP", body: "Paste the storyboard link, then Check so LP can send it." };
    return { tone: "do", title: "Your job", body: "Set WIP, paste the storyboard link, then Check so LP can send it." };
  }
  if (role === "programmer") {
    const onDev = String(t.programmerId || "") === String(me().id);
    if (st === "closed" || st === "approve") return { tone: "ok", title: st === "closed" ? "Closed" : "Sent to client", body: "Nothing else on this card." };
    if (!onDev) return { tone: "wait", title: "Not on you yet", body: "You are not on this card. LP can assign you from Ready — you start HTML after Art ready." };
    if (st === "done") return { tone: "wait", title: "Waiting for LP", body: "HTML link is in. Line Producer sends it. Need Fixing if the client bounces it." };
    if (html) {
      if (st === "revision") return { tone: "fix", title: "Need Fixing", body: "Fix the HTML, set WIP, paste a new link, then Done." };
      if (st === "artready") return { tone: "do", title: "Art ready", body: "Art is in. Set WIP, paste the HTML link, then Done." };
      if (!hasResult) return { tone: "do", title: "Your job", body: "Build the playable, paste the HTML link, then Done." };
      return { tone: "do", title: "Done", body: "Link is in. Set Done so LP can send." };
    }
    return { tone: "wait", title: "Art is still in progress", body: "You start HTML after AD sets Art ready. Storyboard is not your field." };
  }
  if (role === "designer") {
    return { tone: "ok", title: "Art help", body: `${hoursForPerson(t, me().id) || 0}h on this playable. AD owns status — you do not change it.` };
  }
  if (role === "teamlead") {
    if (st === "closed") return { tone: "ok", title: "Closed", body: "Client accepted. This playable is finished." };
    if (st === "approve" || st === "done") return { tone: "wait", title: "With LP", body: "AD / DEV finished this step. Only LP sends to SuperPlay." };
    return { tone: "wait", title: "Playables seats are LP", body: "Read the card. LP assigns AD / DEV. You do not set Playables status." };
  }
  if (st === "closed") return { tone: "ok", title: "Closed", body: "Client accepted. Hours stay on this month." };
  if (st === "approve") return { tone: "ok", title: "Already sent", body: "HTML is with the client. Mark Closed when they accept. Need Fixing if they bounce it." };
  if (st === "done" && hasResult) return { tone: "do", title: "Your job", body: "HTML is in. Send to client, or Mark Closed if they already accepted." };
  if (st === "check") return { tone: "do", title: "Your job", body: "Storyboard is ready. Send to client — only LP talks to SuperPlay." };
  if (st === "clientart") return { tone: "wait", title: "Sent", body: "Waiting on the client. Need Fixing if they bounce it. Final art when they approve the board." };
  if (st === "artready") {
    return t.programmerId
      ? { tone: "wait", title: "Art ready", body: `${progName || "Programmer"} can set WIP and start HTML. If they are away, set the status yourself.` }
      : { tone: "do", title: "Assign DEV", body: "Art is ready. Put a programmer on the card if they are not there yet. They can sit on the card from Ready." };
  }
  if (html && t.programmerId) return { tone: "wait", title: "In WIP", body: `${progName || "Programmer"} is on HTML. Send after Done. If they are away, set the status yourself.` };
  if (st === "finalart") return { tone: "wait", title: "Final art", body: `${name || "Art Director"} is finishing art. Then Art ready. If they are away, set Art ready yourself.` };
  if (st === "revision") return { tone: "wait", title: "Need Fixing", body: html ? `${progName || "Programmer"} is fixing HTML. If they are away, set the status yourself.` : `${name || "Art Director"} is fixing the storyboard. If they are away, set the status yourself.` };
  const ad = playableAdId(t);
  if (!ad && !t.programmerId) {
    return { tone: "do", title: "Assign people", body: "Put AD and DEV on the card now. Hours sit next to the person. One DEV is enough if this is code-only." };
  }
  if (!ad && t.programmerId) {
    return {
      tone: "wait",
      title: "In progress",
      body: `${progName || "Programmer"} is on this. One DEV is enough — put AD on only if art starts.`,
    };
  }
  if (st === "wip") return { tone: "wait", title: "WIP", body: `${name || "Art Director"} is on the storyboard. You send after Check. If they are away, set Check yourself.` };
  if (st === "new") {
    return {
      tone: "wait",
      title: "Waiting for AD",
      body: `${name || "Art Director"} sets WIP, then Check. If they are away, set the status yourself. You can already put DEV on the card — they start HTML after Art ready.`,
    };
  }
  return { tone: "wait", title: "In progress", body: `${name || "Art Director"} is on this. If they are away, set the status yourself. Send the storyboard, then HTML.` };
}
function showResultField(t) {
  if (String(t.resultUrl || "").trim() || String(t.storyboardUrl || "").trim()) return true;
  if (isPlayables(t)) {
    if (canOps()) return true;
    if (isProgrammer() && String(t.programmerId || "") === String(me().id) && playableInHtml(t)) return true;
    if (isArtDirector() && playableAdId(t) === me().id && !playableInHtml(t)) return true;
    return false;
  }
  if (t.assigneeId === me().id && (isDesigner() || isTeamLead())) return true;
  if (canOps() && t.studioStatus !== "new") return true;
  return false;
}
function fillDrivePackIfMissing(t) {
  if (!isStudioHost() || !canOps()) return;
  if ((hasDriveDoc(t) && hasDriveFolder(t)) || state.driveTried[t.id]) return;
  // Create already spawned the pack. A second /api/drive/ensure raced it and
  // made a twin folder with the same name.
  if (state.driveQueued[t.id]) return;
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
  state.driveQueued[t.id] = false;
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
    const shown = isPerformer()
      ? hoursForPerson(t, me().id)
      : isFinance()
        ? playableDeskTotal(t)
        : playableCrewTotal(t);
    return shown ? `${shown}h` : `<span class="empty">—</span>`;
  }
  if (canEditTime()) {
    return `<span class="time-edit">
      ${deskNumInput("shift-in", t.id, t.shifts, `Shifts · hours = shifts × ${shiftHours()}`)}
      <small>${hours ? hours + "h" : "—"}</small>
    </span>`;
  }
  if (!t.shifts && !t.hours) return `<span class="empty">—</span>`;
  return `${t.shifts || "—"} / ${hours || "—"}h`;
}

function statusRank(t) {
  return STATUS[t.studioStatus]?.order || 99;
}

function isUrgent(t) {
  return Boolean(t && t.urgent);
}

function sortedTasks(list) {
  return list.slice().sort((a, b) => {
    const d = statusRank(a) - statusRank(b);
    if (d) return d;
    const u = Number(isUrgent(b)) - Number(isUrgent(a));
    if (u) return u;
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
  const unassigned = tasks.filter((t) => (isPlayables(t) ? !playableAdId(t) && !t.programmerId : !t.assigneeId));
  const unHours = unassigned.reduce((s, t) => s + deskHours(t), 0);
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

function urgentMark(t) {
  if (!isUrgent(t)) return "";
  return `<span class="urgent-mark" title="Urgent — do this first">!</span>`;
}

function withUrgentCue(t, job) {
  if (!isUrgent(t) || t.studioStatus === "closed") return job;
  return {
    ...job,
    body: `Marked URGENT — take this before other work. ${job.body}`,
  };
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
        dir,
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
function reportDirBlock(sections, dir) {
  const rows = sections.filter((sec) => sec.dir === dir);
  const hours = rows.reduce((s, sec) => s + sec.hours, 0);
  const shifts = rows.reduce((s, sec) => s + sec.shifts, 0);
  return { rows, hours, shifts };
}

function kyivVisitStamp(iso) {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "—";
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(at).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}
function uaLabel(ua) {
  const s = String(ua || "");
  if (/Edg\//i.test(s)) return "Edge";
  if (/Chrome\//i.test(s) && !/Edg\//i.test(s)) return "Chrome";
  if (/Firefox\//i.test(s)) return "Firefox";
  if (/Safari\//i.test(s) && !/Chrome/i.test(s)) return "Safari";
  return s.slice(0, 28) || "—";
}
function visitPlace(row) {
  const country = String(row?.country || "").trim();
  const isp = String(row?.isp || "").trim();
  const host = String(row?.host || "").trim();
  if (country && isp && country.toLowerCase() !== isp.toLowerCase()) return `${country} · ${isp}`;
  if (country || isp) return country || isp;
  if (host) return host;
  return "—";
}
function superplayVisitsHtml() {
  const rows = Array.isArray(state.db?.superplayVisits) ? state.db.superplayVisits : [];
  const blurb = "Clock is Kyiv time. Where is the IP country / provider — not the city on the clock. Shared PIN — Login is whatever they typed.";
  if (!rows.length) {
    return `<section class="sp-visits">
      <h3>Sign-ins</h3>
      <p>${blurb}</p>
      <p class="sp-visits-empty">No SuperPlay sign-ins yet.</p>
    </section>`;
  }
  const body = rows
    .map(
      (row) => `<tr>
        <td>${escapeHtml(kyivVisitStamp(row.at))}</td>
        <td>${escapeHtml(row.login || "SuperPlay")}</td>
        <td class="sp-where" title="${escapeHtml(row.host || row.ip || "")}">${escapeHtml(visitPlace(row))}</td>
        <td class="sp-ip">${escapeHtml(row.ip || "—")}</td>
        <td title="${escapeHtml(row.ua || "")}">${escapeHtml(uaLabel(row.ua))}</td>
      </tr>`
    )
    .join("");
  return `<section class="sp-visits">
      <h3>Sign-ins · ${rows.length}</h3>
      <p>${blurb}</p>
      <div class="sp-visits-scroll">
        <table class="sp-visits-table">
          <thead><tr><th>When</th><th>Login</th><th>Where</th><th>IP</th><th>Browser</th></tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    </section>`;
}

function hoursKpiHtml(value, label, dir) {
  const on = dir ? state.hoursDir === dir : !state.hoursDir;
  const key = dir || "";
  return `<button type="button" class="kpi${on ? " on" : ""}" data-hours-dir="${escapeHtml(key)}" aria-pressed="${on ? "true" : "false"}"><b>${value}</b><span>${escapeHtml(label)}</span></button>`;
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
  const mgx = reportDirBlock(sections, "mgx");
  const play = reportDirBlock(sections, "playables");
  if (state.hoursDir === "mgx" && !mgx.rows.length) state.hoursDir = null;
  if (state.hoursDir === "playables" && !play.rows.length) state.hoursDir = null;
  const showMgx = (!state.hoursDir || state.hoursDir === "mgx") && mgx.rows.length;
  const showPlay = (!state.hoursDir || state.hoursDir === "playables") && play.rows.length;
  const totalProjects = sections.reduce((s, sec) => s + sec.rows.length, 0);
  const sectionHtml = (sec) => {
    const rows = sec.rows
      .map(
        (t) => `<tr class="sp-row">
            <td class="sp-name" title="${escapeHtml(t.name)}">${escapeHtml(t.name)}</td>
            <td class="sp-st">${statusChip(t)}</td>
            <td class="sp-num">${fmtReportNum(t.shifts, 3)}</td>
            <td class="sp-num">${fmtReportNum(hoursOf(t), 1)}</td>
            <td class="sp-num"></td>
          </tr>`
      )
      .join("");
    return `<tr class="sp-sec">
          <th class="sp-name">${escapeHtml(sec.label)}</th>
          <th class="sp-st"></th>
          <th class="sp-num"></th>
          <th class="sp-num"></th>
          <th class="sp-num sp-sec-sum">${fmtReportNum(sec.hours, 1)}</th>
        </tr>${rows}`;
  };
  const dirTotalRow = (label, block) =>
    `<tr class="sp-dir-total">
            <td class="sp-name">${escapeHtml(label)}</td>
            <td class="sp-st"></td>
            <td class="sp-num">${fmtReportNum(block.shifts, 1)}</td>
            <td class="sp-num sp-hours">${fmtReportNum(block.hours, 1)}</td>
            <td class="sp-num sp-hours">${fmtReportNum(block.hours, 1)}</td>
          </tr>`;
  const sheetHtml = (kind, label, block) =>
    `<div class="sp-sheet sp-sheet-${kind}">
        <div class="sp-scroll">
          <table class="sp-table">
            <colgroup>
              <col class="sp-col-name" />
              <col class="sp-col-st" />
              <col class="sp-col-num" />
              <col class="sp-col-num" />
              <col class="sp-col-num" />
            </colgroup>
            <thead>
              <tr>
                <th class="sp-name">${escapeHtml(year)} PROJECT NAME</th>
                <th class="sp-st">STATUS</th>
                <th class="sp-num">SHIFTS</th>
                <th class="sp-num">HOURS</th>
                <th class="sp-num sp-sum-h"></th>
              </tr>
            </thead>
            <tbody>
              ${block.rows.map(sectionHtml).join("")}
              ${dirTotalRow(label, block)}
            </tbody>
          </table>
        </div>
      </div>`;
  const sheets = [
    showMgx ? sheetHtml("mgx", "MGX TOTAL", mgx) : "",
    showPlay ? sheetHtml("play", "Playable TOTAL", play) : "",
  ]
    .filter(Boolean)
    .join("");
  $("board").innerHTML = `
    <section class="sp-report">
      <div class="sp-kpis">
        ${hoursKpiHtml(totalProjects, "projects")}
        ${mgx.rows.length ? hoursKpiHtml(`${fmtReportNum(mgx.hours, 1)} h`, "MGX", "mgx") : ""}
        ${play.rows.length ? hoursKpiHtml(`${fmtReportNum(play.hours, 1)} h`, "Playable", "playables") : ""}
        ${hoursStampKpi()}
      </div>
      <div class="sp-blocks">${sheets}</div>
      <div class="sp-download">
        <button type="button" class="btn green" id="btnHoursXlsx">Download Excel</button>
      </div>
      ${isFinance() ? superplayVisitsHtml() : ""}
    </section>`;
  $("board").querySelectorAll("[data-hours-dir]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = btn.dataset.hoursDir || "";
      state.hoursDir = !next || state.hoursDir === next ? null : next;
      render();
    });
  });
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
  const projectHours = (t) => {
    if (!play) return Number(t.hours) || 0;
    return isFinance() ? playableDeskTotal(t) : playableCrewTotal(t);
  };
  const allHours = tasks.reduce((s, t) => s + projectHours(t), 0);
  const allShifts = tasks.reduce((s, t) => s + (Number(t.shifts) || 0), 0);
  const nameHeads = people.map((p) => `<th class="xl-person">${escapeHtml(p.name)}</th>`).join("");
  const usedSeats = {};
  const emplHeads = people
    .map((p) => `<th>${escapeHtml(excelSeatLabel(p, usedSeats))}</th>`)
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
      ? `<td class="xl-num">${fmtHours(projectHours(t))}</td>`
      : `<td class="xl-num">${t.shifts ?? ""}</td>
      <td class="xl-num">${fmtHours(t.hours)}</td>
      <td class="xl-num">${escapeHtml(excelDate(t.deadline))}</td>`;
    return `<tr class="xl-row${t.studioStatus === "closed" ? " is-closed" : ""}${isUrgent(t) ? " is-urgent" : ""}" data-id="${t.id}">
      <td class="xl-st st-${mark.cls}" title="${escapeHtml(mark.title)}">${escapeHtml(mark.label)}</td>
      <td class="xl-name${isUrgent(t) ? " is-urgent" : ""}" title="${escapeHtml((isUrgent(t) ? "URGENT · " : "") + t.name)}">${urgentMark(t)}${escapeHtml(t.name)}</td>
      ${meta}
      ${cells}
    </tr>`;
  };

  const xlLabel = play ? "Playable" : "MGX";
  const section = (line) => {
    const rows = tasks.filter((t) => t.line === line);
    const metaHeads = play ? `<th>Hours</th>` : `<th>SHIFTS</th><th>HOURS</th><th>DEADLINE</th>`;
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
  if (state.direction === "playables") {
    $("board").innerHTML = `
    <section class="guide">
      <div class="guide-intro">
        <h2>Як працює Playables</h2>
        <p>Прорахунок лишається в Telegram. На дошці робота вже після апруву годин. Два кола: арт / сторіборд, потім HTML. DEV можна посадити з Ready — HTML він починає лише після ${ui("Art ready")}.</p>
      </div>
      <div class="guide-block">
        <h3>Статуси</h3>
        <p class="guide-lead">Один наступний крок на картці. WIP / Check / Done — ті самі слова, що в MGX.</p>
        <div class="guide-status-grid">
          ${statusCard("ready", "Ready", "Ready", "Хто: LP створила, назначила AD / DEV", "Картка в роботі. AD ставить WIP і вставляє сторіборд. DEV уже може сидіти, HTML починає після Art ready.")}
          ${statusCard("wip", "WIP", "WIP", "Хто: хто в колонці Who", "AD малює сторіборд, або DEV збирає HTML після Art ready.")}
          ${statusCard("check", "Check", "Check", "Хто: AD здав борд, далі LP", "Сторіборд готовий, лінк у картці. Тільки LP шле клієнту — це стає Sent.")}
          ${statusCard("fix", "Fix", "Need Fixing", "Хто: відбій клієнта", "Сторіборд — AD править, знову Check. HTML — DEV править, знову Done.")}
          ${statusCard("sent", "Sent", "Sent", "Хто: чекаємо клієнта по борду", "LP відправила сторіборд. Відбили → Need Fixing. Прийняли → LP ставить Final art.")}
          ${statusCard("final", "Final", "Final art", "Хто: AD", "Клієнт прийняв борд. AD фіналізує арт і ставить Art ready.")}
          ${statusCard("artok", "Art OK", "Art ready", "Хто: AD здав, далі DEV", "Арт готовий. DEV ставить WIP. LP могла посадити DEV ще на Ready.")}
          ${statusCard("done", "Done", "Done", "Хто: DEV здав HTML, далі LP", "Лінк у картці. LP шле клієнту або одразу Closed.")}
          ${statusCard("send", "Send", "Send", "Хто: чекаємо клієнта по HTML", "LP натиснула Send to client. Відбили → Need Fixing. Прийняли → Closed.")}
          ${statusCard("closed", "Closed", "Closed", "Хто: LP", "Клієнт прийняв. Години лишаються.")}
        </div>
      </div>
      <div class="guide-block">
        <h3>Пайплайн</h3>
        <p class="guide-lead">Ready → WIP → Check → Sent → Final art → Art ready → WIP → Done → Send → Closed</p>
        <ol class="guide-pipe">
          ${pipeStep("1", "LP", "Line Producer", "Картка заходить", `${ui("Create task")} після апруву годин. Ставить AD і DEV одразу, години — на людей.`, "ready", "Ready")}
          ${pipeStep("2", "AD", "Art Director", "Сторіборд", `${ui("WIP")} → лінк на борд → ${ui("Check")}.`, "check", "Check")}
          ${pipeStep("3", "LP", "Line Producer", "Шле борд", `${ui("Send to client")} з ${ui("Check")}. Статус стає ${ui("Sent")}. Відбій → ${ui("Need Fixing")}. Апрув → ${ui("Final art")}.`, "sent", "Sent")}
          ${pipeStep("4", "AD", "Art Director", "Фінальний арт", `Доробляє арт → ${ui("Art ready")}. DEV уже може бути на картці.`, "artok", "Art OK")}
          ${pipeStep("5", "DEV", "Programmer", "Бере HTML", `На ${ui("Art ready")} ставить ${ui("WIP")}. LP могла посадити його ще на Ready.`, "wip", "WIP")}
          ${pipeStep("6", "DEV", "Programmer", "Збирає HTML", `Лінк у ${ui("HTML")}, потім ${ui("Done")}. Без лінка кнопка не жива.`, "done", "Done")}
          ${pipeStep("7", "LP", "Line Producer", "Шле HTML", `${ui("Send to client")} з ${ui("Done")} + лінк, або одразу ${ui("Closed")}. Відбій HTML → ${ui("Need Fixing")} для DEV.`, "send", "Send")}
        </ol>
      </div>
      <div class="guide-grid">
        ${card("art_director", "AD", "Art Director", "Анна, Юля. Лише свої playable.", [
          `Ready → ${ui("WIP")}. Вставляєш лінк на сторіборд, потім ${ui("Check")}.`,
          `Після відбою: ${ui("WIP")} знову, потім ${ui("Check")}.`,
          `${ui("Final art")} → ${ui("Art ready")}. HTML лінк не твій — його вставляє DEV.`,
          `${ui("Send to client")} у AD немає.`,
        ])}
        ${card("programmer", "DEV", "Programmer", "Богдан. Лише свої playable.", [
          `LP може посадити тебе DEV з Ready. HTML починаєш після ${ui("Art ready")}.`,
          `${ui("WIP")}, лінк, ${ui("Done")}. Без лінка Done не ставиться.`,
          `Код-онлі (немає AD) — ${ui("WIP")} одразу з Ready.`,
          `Відбій HTML — ${ui("Need Fixing")} → ${ui("WIP")} → ${ui("Done")}.`,
        ])}
        ${card("designer", "MD", "Motion design", "Сергій на Playables. Години, не статус.", [
          `Картка з’являється, якщо LP поставив тобі години на арт-спліт.`,
          `Статус не чіпаєш — ним володіє AD. Бриф читаєш, роботу здаєш AD.`,
        ])}
        ${card("manager", "LP", "Line Producer", "Анастасія. Обидві дошки.", [
          `${ui("Create task")} після апруву годин у Telegram. AD і DEV садить одразу, години — на людей. DEV починає HTML після ${ui("Art ready")}.`,
          `${ui("Send to client")} з ${ui("Check")} (борд) і з ${ui("Done")} (HTML + лінк).`,
          `Sent: відбій → ${ui("Need Fixing")}. Апрув борду → ${ui("Final art")}.`,
          `${ui("Mark Closed")} можна без Send, як у MGX. Hours split — студійна оплата. Billed buffer лише DL.`,
        ])}
      </div>
    </section>`;
    return;
  }
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
          ${pipeStep("2", "TL", "Team Lead", "Ставить виконавця", `${ui("Who works this")} пише одразу. Статус лишається Ready.`, "ready", "Ready")}
          ${pipeStep("3", "MD", "Motion design", "Починає і здає", `${ui("WIP")} пише одразу. Потім лінк і ${ui("TL Check")} — теж одразу, без ${ui("Save")}. Не ${ui("Done")}. Після здачі WIP зникає.`, "tlcheck", "TL chk")}
          ${pipeStep("4", "TL", "Team Lead", "Перевіряє", `Після ${ui("TL Check")} TL ставить ${ui("Done")}.`, "done", "Done")}
          ${pipeStep("5", "LP", "Line Producer", "Відправляє клієнту", `${ui("Send to client")} лише з ${ui("Done")} + лінк. Це ${ui("Appr.")}.`, "appr", "Appr.")}
          ${pipeStep("6", "LP", "Line Producer", "Клієнт прийняв", `${ui("Closed")} з ${ui("Done")} або після ${ui("Send")}. Якщо відбили — ${ui("Need Fixing")}, MD знову ${ui("TL Check")}.`, "closed", "Closed")}
        </ol>
      </div>
      <div class="guide-grid">
        ${card("manager", "LP", "Line Producer", "Анастасія. Бачить усе.", [
          `Новий пак: ${ui("Create task")} (тека + бриф на Drive) або ${ui("Shift email")} (NAME 0.3 shift — тире, пробіл або |).`,
          `Бриф на картці пишеться в Google Doc. ${ui("Open brief")} — Doc. ${ui("Task folder")} — тека цього таску на Drive студії. ${ui("Working folder")} — тека клієнта з рядка Working folder у брифі; якщо рядка немає, кнопка сіра. ${ui("Client notes")} одразу під брифом.`,
          `Години: ${ui("Shifts")} у рядку або в картці. 1 shift = 9 годин. Виконавця ставить TL. ${ui("Dead Line")} — дата з Excel. ${ui("URGENT")} — червоний ${ui("!")} на імені, вмикаєш з картки, це не статус.`,
          `Рядок фарбується за статусом. Чіп: ${ui("Ready")} / ${ui("WIP")} / ${ui("Fix")} / ${ui("Done")} / ${ui("Appr.")} / ${ui("Closed")}. Не ${ui("Send")}.`,
          `${ui("Excel")} — години як у файлі. Чіп зліва той самий, що в пайплайні, не лише WIP/Closed. ${ui("Dead Line")} = ${ui("DEADLINE")}. ${ui("URGENT")} — маркер ${ui("!")}, не статус.`,
          `Якщо MD або TL немає — постав ${ui("WIP")} / ${ui("TL Check")} / ${ui("Done")} сам. ${ui("Send to client")} лише з ${ui("Done")} + лінк файлу, кнопка внизу. Копіює текст у External Weekly. ${ui("Appr.")} сам не ставиться.`,
          `${ui("Mark Closed")} коли клієнт прийняв — можна без ${ui("Send")}. Темно-зелений штамп, білий напис — не той самий колір, що ${ui("Done")}. ${ui("URGENT")} знімається сам. Якщо відбили — ${ui("Need Fixing")}.`,
          `${ui("Hours split")} на картці: клієнтські години не ростуть. 0.5h тому, хто відрендерив замість колеги. Who лишається власником ${ui("Done")}.`,
        ])}
        ${card("teamlead", "TL", "Team Lead", "Настя. Усі проєкти + свої як виконавця.", [
          `Дзвіночок ${ui("New")} — нові без людини. Картка каже ${ui("Assign a designer")} — це твоя робота, не URL і не Done.`,
          `Прочитай бриф, ${ui("Open brief")} якщо треба Doc. ${ui("Who works this")} пише одразу. Людина одразу бачить таск у себе.`,
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
            `Адреса студії ${ui("board.lisenbart.games")}. Кнопка ${ui("Client")} → логін + PIN. Після входу — ${ui("SuperPlay")}.`,
            `Можна кинути пряме посилання ${ui("/superplay")}. Старе ${ui("/hours")} туди ж. Список: ${ui("PROJECT NAME")} / ${ui("STATUS")} / ${ui("SHIFTS")} / ${ui("HOURS")}.`,
            `У ${ui("Login")} можна написати ім’я — PIN спільний. ${ui("DL")} бачить журнал входів (час Київ, Login, IP, браузер).`,
            `Секції ${ui("MGX")} і ${ui("Playable")} (DX / DD / DS), статус як на пайплайні, ${ui("TOTAL")} знизу. Імен виконавців, ставок і карток немає.`,
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
          <p>Місяць як ${ui("SP_MGX_check")}. Зліва жирні ${ui("DX")} / ${ui("DD")}, у тій клітинці чіп проєкту: ${ui("Ready")} / ${ui("WIP")} / ${ui("Fix")} / ${ui("Done")} / ${ui("Appr.")} / ${ui("Closed")}. ${ui("DEADLINE")} у файлі = ${ui("Dead Line")} на пайплайні. ${ui("URGENT")} — окремий маркер ${ui("!")} від LP/DL, не колонка в Excel. ${ui("Send")} там немає.</p>
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
        <div class="cell">Dead Line</div>
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
      if (e.target.closest("input,select,a,button,.num-step,.col-splitter")) return;
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

function bindNumStep(el, commit, step = 1) {
  const wrap = el.closest(".num-step");
  const bump = (dir) => stepDeskNum(el, dir, step);
  const hold = (btn, dir) => {
    if (!btn) return;
    let delay = 0;
    let repeat = 0;
    let held = false;
    const stop = () => {
      window.clearTimeout(delay);
      window.clearInterval(repeat);
      delay = 0;
      repeat = 0;
    };
    const start = (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      stop();
      held = true;
      bump(dir);
      try {
        btn.setPointerCapture(e.pointerId);
      } catch (_) {}
      delay = window.setTimeout(() => {
        repeat = window.setInterval(() => bump(dir), 80);
      }, 380);
    };
    const end = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!held) return;
      held = false;
      stop();
      commit();
    };
    btn.addEventListener("pointerdown", start);
    btn.addEventListener("pointerup", end);
    btn.addEventListener("pointercancel", end);
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
  };
  hold(wrap?.querySelector(".num-step-up"), 1);
  hold(wrap?.querySelector(".num-step-down"), -1);
  wrap?.addEventListener("pointerdown", (e) => e.stopPropagation());
  wrap?.addEventListener("click", (e) => e.stopPropagation());
  el.addEventListener("click", (e) => e.stopPropagation());
  el.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      bump(1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      bump(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      el.blur();
    }
  });
  el.addEventListener("change", commit);
}

function bindTimeEdits() {
  $("board").querySelectorAll(".shift-in").forEach((el) => {
    const commit = () => {
      const t = state.db.tasks.find((x) => x.id === el.dataset.id);
      if (!t) return;
      const shifts = parseShifts(el.value);
      if (shifts === null) {
        el.value = fmtDeskNum(t.shifts);
        toast("Shifts must be 0 or more");
        return;
      }
      if (shifts === Number(t.shifts)) return;
      const hours = hoursFromShifts(shifts);
      const hint = el.closest(".time-edit")?.querySelector("small");
      if (hint) hint.textContent = hours ? hours + "h" : "—";
      updateTask(
        t.id,
        {
          shifts,
          role: me().role,
          note: `${me().name} set ${shifts} shifts → ${hours} h`,
        },
        { quiet: true }
      );
    };
    bindNumStep(el, commit, 0.1);
  });
  $("board").querySelectorAll(".hours-in").forEach((el) => {
    const commit = () => {
      const t = state.db.tasks.find((x) => x.id === el.dataset.id);
      if (!t) return;
      const hours = parseShifts(el.value);
      if (hours === null) {
        el.value = fmtDeskNum(t.hours);
        toast("Hours must be 0 or more");
        return;
      }
      if (hours === Number(t.hours)) return;
      updateTask(
        t.id,
        {
          hours,
          role: me().role,
          note: `${me().name} set ${hours} billed hours`,
        },
        { quiet: true }
      );
    };
    bindNumStep(el, commit, 1);
  });
}

function statusMark(t) {
  const key = isPlayables(t) ? playableStatusKey(t) : t.studioStatus || "new";
  const title = (STATUS[key] || STATUS.new).label;
  return (
    {
      quote: { cls: "quote", label: "Quote", title },
      new: { cls: "ready", label: "Ready", title },
      wip: { cls: "wip", label: "WIP", title },
      revision: { cls: "fix", label: "Fix", title },
      tlcheck: { cls: "tlcheck", label: "TL chk", title },
      check: { cls: "check", label: "Check", title },
      done: { cls: "done", label: "Done", title },
      approve: { cls: isPlayables(t) ? "send" : "appr", label: isPlayables(t) ? "Send" : "Appr.", title },
      closed: { cls: "closed", label: "Closed", title },
      clientart: { cls: "sent", label: "Sent", title },
      finalart: { cls: "final", label: "Final", title },
      artready: { cls: "artok", label: "Art OK", title },
      storyboard: { cls: "check", label: "Check", title },
      build: { cls: "artok", label: "Art OK", title },
      htmlready: { cls: "done", label: "Done", title },
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
  const flag = urgentMark(t);
  const nameTitle = escapeHtml((isUrgent(t) ? "URGENT · " : "") + t.name);
  const frozen =
    mode === "ops"
      ? `<div class="frozen">
          <div class="cell"><span class="pill line-${t.line}">${t.line}</span></div>
          <div class="cell">${pick}</div>
          <div class="cell name" title="${nameTitle}">${chip}${flag}<span class="name-text">${escapeHtml(t.name)}</span></div>
        </div>`
      : `<div class="frozen">
          <div class="cell"><span class="pill line-${t.line}">${t.line}</span></div>
          <div class="cell name" title="${nameTitle}">${chip}${flag}<span class="name-text">${escapeHtml(t.name)}</span></div>
        </div>`;
  return `
    <div class="row ${mode} tone-${escapeHtml(isPlayables(t) ? playableStatusKey(t) : t.studioStatus || "new")}${gapCls}${isUrgent(t) ? " is-urgent" : ""} ${checked ? "selected" : ""}" data-id="${t.id}">
      ${frozen}
      <div class="meta">
        <div class="cell">${timeCell(t)}</div>
        <div class="cell"><span class="pill ${st.cls}">${statusText(t.studioStatus || "new", t)}</span></div>
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

function playableStatusKey(t) {
  const st = t?.studioStatus || "new";
  if (["new", "wip", "check", "revision", "clientart", "finalart", "artready", "done", "approve", "closed"].includes(st)) return st;
  if (st === "storyboard" || st === "tlcheck") return "check";
  if (st === "htmlready") return "done";
  if (st === "build") return "artready";
  return "new";
}
function playableInHtml(t) {
  const st = playableStatusKey(t);
  if (["artready", "done", "approve", "closed"].includes(st)) return true;
  if (t?.playableHtml) return true;
  if (!playableAdId(t) && String(t?.programmerId || "").trim()) return true;
  return false;
}
function playableDevUnlocked(t) {
  const st = playableStatusKey(t);
  if (!playableAdId(t)) return true;
  if (String(t?.programmerId || "").trim()) return true;
  return ["artready", "done", "approve", "closed"].includes(st);
}
function playableNextStatuses(role, t) {
  const st = playableStatusKey(t);
  const hasAd = Boolean(playableAdId(t));
  const html = playableInHtml(t);
  if (role === "manager" || role === "finance") {
    return PLAY_OPS_STATUSES.slice();
  }
  if (role === "art_director") {
    if (html) return [];
    return (
      {
        new: ["wip"],
        wip: ["check"],
        revision: ["wip"],
        finalart: ["artready"],
      }[st] || []
    );
  }
  if (role === "programmer") {
    if (st === "artready") return ["wip"];
    if (!hasAd && st === "new") return ["wip"];
    if (st === "wip" && (html || !hasAd)) return ["done"];
    if (st === "revision" && (html || !hasAd)) return ["wip"];
    return [];
  }
  return [];
}
function playableStatusActions(task) {
  const role = me().role;
  const next = playableNextStatuses(role, task);
  if (role === "art_director" && playableAdId(task) !== me().id) return [];
  if (role === "programmer" && String(task?.programmerId || "") !== String(me().id)) return [];
  return next;
}
function statusActions(task) {
  const role = me().role;
  const cur = task?.studioStatus || "new";
  if (isPlayables(task)) return playableStatusActions(task);
  const mine = String(task?.assigneeId || "") === String(me().id);
  if (role === "designer") {
    if (!mine || ["done", "approve", "closed"].includes(cur)) return [];
    if (cur === "tlcheck") return ["tlcheck"];
    return ["wip", "tlcheck"];
  }
  if (role === "teamlead") {
    const out = [];
    if (mine && !["done", "approve", "closed", "tlcheck"].includes(cur)) {
      out.push("wip", "tlcheck");
    }
    if (cur === "tlcheck") {
      out.push("tlcheck");
      out.push("done");
    }
    return out;
  }
  if (role === "manager" || role === "finance") {
    return MGX_OPS_STATUSES.slice();
  }
  return [];
}

function statusButtonDisabled(task, key, opts) {
  const on = (task.studioStatus || "new") === key;
  if (opts.locked) return true;
  if (!opts.canEdit) return true;
  if (on) return true;
  if (isPlayables(task)) {
    if ((key === "done" || key === "check") && !hasResultLink(task, opts.typedResult)) return true;
    return !canSetStatus(key, task);
  }
  if (key === "tlcheck" && !hasResultLink(task, opts.typedResult)) return true;
  if (key === "done" && !hasResultLink(task, opts.typedResult)) return true;
  if (key === "done" && task.studioStatus !== "tlcheck" && !canOps()) return true;
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
    const label = statusText(key, t);
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
    const t = state.db?.tasks?.find((x) => x.id === state.openId);
    pill.className = `pill ${STATUS[key].cls}`;
    pill.textContent = statusText(key, t);
  }
}

function canSetStatus(next, task) {
  const t = task || state.db?.tasks?.find((x) => x.id === state.openId);
  if (t && isPlayables(t)) {
    if (next === (t.studioStatus || "new")) return true;
    if (next === "closed") return canOps();
    return playableStatusActions(t).includes(next);
  }
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
  const watch = state.db?.meta?.excelWatch || {};
  const bits = [];
  if (d.pulledAt) bits.push(String(d.pulledAt).replace("T", " ").replace("Z", ""));
  if (watch.error) bits.push(String(watch.error));
  const status = bits.length ? `<p>${escapeHtml(bits.join(" · "))}</p>` : "";
  return `<div class="drive-strip">
    <div>
      <strong>Google Drive</strong>
      ${status}
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
    const id = row.dataset.id;
    const input = row.querySelector(".team-name");
    if (input) state.teamDrafts[id] = input.value;
    const pin = row.querySelector(".team-pin");
    if (pin) state.teamPins[id] = pin.value;
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

function teamPinValue(p) {
  const draft = state.teamPins[p.id];
  return draft !== undefined ? draft : p.pin || "";
}

function parseTeamPin(raw) {
  const pin = String(raw || "").trim();
  if (!pin) return { pin: "", error: "" };
  if (!/^\d{4,8}$/.test(pin)) return { pin: "", error: "PIN must be 4–8 digits" };
  return { pin, error: "" };
}

function teamRowPayload(row) {
  const id = row?.dataset.id;
  const name = String(row?.querySelector(".team-name")?.value || "").trim();
  const job = row?.querySelector(".team-job")?.value || "";
  const parsed = parseTeamPin(row?.querySelector(".team-pin")?.value);
  const payload = { id, name };
  if (job) payload.job = job;
  if (parsed.error) payload.pinError = parsed.error;
  else if (parsed.pin) payload.pin = parsed.pin;
  return payload;
}

function teamRowDirty(row) {
  const id = row?.dataset.id;
  const person = (state.db.people || []).find((p) => p.id === id);
  if (!person) return false;
  const name = String(row.querySelector(".team-name")?.value || "").trim();
  const pin = String(row.querySelector(".team-pin")?.value || "").trim();
  const jobEl = row.querySelector(".team-job");
  if (name !== displayName(person)) return true;
  if (pin !== String(person.pin || "").trim()) return true;
  if (jobEl && jobEl.value !== person.role) return true;
  return false;
}

function refreshTeamSaves() {
  let any = false;
  $("board")?.querySelectorAll(".team-row").forEach((row) => {
    const dirty = teamRowDirty(row);
    any = any || dirty;
    setIdleEnabled(row.querySelector(".team-save"), dirty);
  });
  setIdleEnabled($("saveAllNames"), any);
}

async function flushTeamNames() {
  captureTeamDrafts();
  const people = [...($("board")?.querySelectorAll(".team-row") || [])]
    .filter((row) => teamRowDirty(row))
    .map((row) => teamRowPayload(row))
    .filter((p) => p.id && p.name);
  const bad = people.find((p) => p.pinError);
  if (bad) return { error: bad.pinError };
  if (!people.length) return { state: state.db };
  const out = await api("/api/people/update", { people, role: me().role });
  if (out.error || !out.state) return out;
  for (const p of people) {
    delete state.teamDrafts[p.id];
    delete state.teamPins[p.id];
  }
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
        <input class="team-name" value="${escapeHtml(displayName(p))}" placeholder="Name" autocomplete="off" />
        <input class="team-pin" value="${escapeHtml(teamPinValue(p))}" placeholder="PIN" inputmode="numeric" maxlength="8" autocomplete="off" aria-label="PIN" />
        <button class="btn primary team-save" type="button" disabled>Save</button>
        <button class="btn ghost team-del" type="button">Delete</button>
      </div>`
    )
    .join("");
  $("board").innerHTML = `
    <section class="group" style="padding:18px">
      <h2 style="margin:0 0 12px">Team names</h2>
      <p class="team-hint">Name and PIN save together. Changing a PIN replaces the old one — the previous PIN no longer opens that seat. PIN is 4–8 digits. Keep at least one Team Lead.</p>
      ${rows}
      <div class="team-add">
        <select id="addJob">${TEAM_JOBS.map((j) => `<option value="${j.id}">${j.label}</option>`).join("")}</select>
        <button class="btn" type="button" id="addPerson">Add person</button>
        <button class="btn primary" type="button" id="saveAllNames" disabled>Save all names</button>
      </div>
    </section>`;
  $("board").querySelectorAll(".team-name").forEach((input) => {
    input.addEventListener("input", () => {
      state.teamDrafts[input.closest(".team-row").dataset.id] = input.value;
      refreshTeamSaves();
    });
  });
  $("board").querySelectorAll(".team-pin").forEach((input) => {
    input.addEventListener("input", () => {
      state.teamPins[input.closest(".team-row").dataset.id] = input.value;
      refreshTeamSaves();
    });
  });
  $("board").querySelectorAll(".team-job").forEach((sel) => {
    sel.addEventListener("change", refreshTeamSaves);
  });
  $("board").querySelectorAll(".team-save").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const row = btn.closest(".team-row");
      if (!teamRowDirty(row)) return;
      const payload = teamRowPayload(row);
      if (!payload.name) {
        toast("Name cannot be empty");
        return;
      }
      if (payload.pinError) {
        toast(payload.pinError);
        return;
      }
      setBusy(btn, true, "Saving…");
      try {
        const out = await api("/api/people/update", { ...payload, role: me().role });
        if (out.error || !out.state) {
          toast(out.error || "Could not save");
          return;
        }
        delete state.teamDrafts[row.dataset.id];
        delete state.teamPins[row.dataset.id];
        applyState(out.state);
        toast("Saved");
      } finally {
        setBusy(btn, false);
      }
    });
  });
  $("board").querySelectorAll(".team-del").forEach((btn) => {
    btn.addEventListener("click", () => openDeletePerson(btn.closest(".team-row").dataset.id));
  });
  $("saveAllNames").onclick = async () => {
    const go = $("saveAllNames");
    if (go?.disabled) return;
    setBusy(go, true, "Saving…");
    try {
      const out = await flushTeamNames();
      if (out.error) toast(out.error);
      else toast("All names and PINs saved");
    } finally {
      setBusy(go, false);
    }
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
  refreshTeamSaves();
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
  delete state.teamPins[id];
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
function playableRoleOptions(list, selected, taken, kind) {
  const skip = new Set([...(taken || [])].filter((id) => id && id !== selected));
  const label = kind === "dev" ? "pick DEV" : "pick AD";
  const opts = list
    .filter((p) => p.id === selected || !skip.has(p.id))
    .map(
      (p) =>
        `<option value="${p.id}" ${p.id === selected ? "selected" : ""}>${escapeHtml(p.name)} · ${jobMeta(p).code}</option>`
    )
    .join("");
  return `<option value="">— ${label}</option>${opts}`;
}
function playableOwnerHtml(id, empty) {
  return id && person(id) ? personCell(id) : `<span class="play-seat-empty">${empty}</span>`;
}
function playableSplitRowHtml(kind, row, taken) {
  const list = kind === "dev" ? programmers() : artDirectors();
  return `<div class="play-seat-row play-split-row" data-kind="${kind}">
      <select class="play-split-person">${playableRoleOptions(list, row.id, taken, kind)}</select>
      <input class="play-split-hours" type="number" min="0.1" step="0.1" value="${row.hours || ""}" />
      <button type="button" class="btn ghost help-del" title="Remove">×</button>
    </div>`;
}
function takePlayableOwner(ownerId, ownerHours, splits, extraIds) {
  const id = String(ownerId || "").trim();
  const hours = roundHours(ownerHours);
  const rest = Array.isArray(splits) ? splits.filter((row) => row && row.id) : [];
  if (id) return { ownerId: id, ownerHours: hours, splits: rest.filter((row) => row.id !== id) };
  const first = rest[0] || (extraIds?.[0] ? { id: extraIds[0], hours: 0 } : null);
  if (!first?.id) return { ownerId: "", ownerHours: hours, splits: rest };
  return {
    ownerId: first.id,
    ownerHours: hours || first.hours,
    splits: rest.filter((row) => row.id !== first.id),
  };
}
function readPlayableSplitIds(kind) {
  const box = kind === "dev" ? $("devSplitRows") : $("adSplitRows");
  const ids = [];
  const seen = new Set();
  box?.querySelectorAll(".play-split-person").forEach((sel) => {
    const id = sel.value || "";
    if (!id || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  });
  return ids;
}
function playableSeatHtml(kind, t, editable) {
  const isAd = kind === "ad";
  const ownerId = isAd ? playableAdId(t) : String(t.programmerId || "");
  const hours = isAd ? roundHours(t.assigneeHours) : roundHours(t.programmerHours);
  const splits = isAd ? playableAdSplits(t) : playableDevSplits(t);
  if (!editable && !ownerId && !splits.length) return "";
  const taken = [ownerId, ...splits.map((row) => row.id)];
  const given = splits.reduce((s, row) => s + row.hours, 0);
  const pool = roundHours(hours + given);
  const title = isAd ? "AD" : "DEV";
  const empty = isAd ? "No AD" : "No DEV";
  const hoursId = isAd ? "stAdHours" : "stProgHours";
  const rowsId = isAd ? "adSplitRows" : "devSplitRows";
  const addId = isAd ? "adSplitAdd" : "devSplitAdd";
  const sumId = isAd ? "playAdTotal" : "playDevTotal";
  const roster = isAd ? artDirectors() : programmers();
  const ownerPick = canAssignPlayable()
    ? `<select id="${isAd ? "stPerson" : "stProgrammer"}" class="play-owner-pick" aria-label="${title}">
        <option value="">— ${title}</option>
        ${roster
          .map(
            (p) =>
              `<option value="${p.id}" ${ownerId === p.id ? "selected" : ""}>${escapeHtml(p.name)} · ${jobMeta(p).code}</option>`
          )
          .join("")}
      </select>`
    : `<div class="play-seat-who">${playableOwnerHtml(ownerId, empty)}</div>`;
  const ownerRow = editable
    ? `<div class="play-seat-row is-owner">
         ${ownerPick}
         <input id="${hoursId}" type="number" min="0" step="0.1" value="${hours || ""}" aria-label="${title} hours" />
       </div>`
    : `<div class="play-seat-row is-owner">
         <div class="play-seat-who">${playableOwnerHtml(ownerId, empty)}</div>
         <span class="help-h">${ownerId ? `${hours || 0}h` : "—"}</span>
       </div>`;
  const splitEdit = editable && canEditPlayableCrew();
  const splitRows = splits
    .map((row) =>
      splitEdit
        ? playableSplitRowHtml(kind, row, taken)
        : `<div class="play-seat-row"><span>${personCell(row.id)}</span><span class="help-h">${row.hours}h</span></div>`
    )
    .join("");
  const add = splitEdit ? `<button type="button" class="play-seat-add" id="${addId}">Add ${title}</button>` : "";
  return `<div class="play-seat play-seat-${kind}" data-pool="${pool || ""}">
      <div class="play-seat-head">
        <span class="job-badge job-${kind}">${title}</span>
        <b class="play-seat-sum" id="${sumId}" ${splits.length ? "" : "hidden"}>${pool}h</b>
      </div>
      ${ownerRow}
      <div id="${rowsId}">${splitRows}</div>
      ${add}
    </div>`;
}
function playableHoursHtml(t, editable) {
  const crew = playableCrewTotal(t);
  const buffer = playableStudioBuffer(t);
  const billed = roundHours(crew + buffer);
  const mine = onMyPlayable(t);
  const adId = playableAdId(t);
  const ads = playableAdSplits(t);
  const devs = playableDevSplits(t);
  const adHours = editable;
  const devHours = editable;
  if (!editable && !adId && !t.programmerId && !ads.length && !devs.length) return "";
  if (!editable && isPerformer() && !mine) return "";
  const you =
    !editable && mine && hoursForPerson(t, me().id)
      ? `<span class="play-crew-you">you ${hoursForPerson(t, me().id)}h</span>`
      : "";
  const financeStrip = isFinance()
    ? `<section class="help-split play-finance">
      <label>Studio</label>
      <div class="ops-item"><label>Studio buffer</label>
        <input id="stStudioBuffer" type="number" min="0" step="0.1" value="${buffer || ""}" /></div>
      <div class="help-owner"><span>Billed</span><b id="playBilled">${billed}h</b></div>
    </section>`
    : "";
  return `<section class="help-split play-crew">
      <label>Who · hours</label>
      ${playableSeatHtml("ad", t, adHours)}
      ${playableSeatHtml("dev", t, devHours)}
      <div class="play-crew-foot"><span>Crew ${you}</span><b id="playCrew">${crew}h</b></div>
    </section>${financeStrip}`;
}
function readPlayableSplits(kind, ownerId) {
  const box = kind === "dev" ? $("devSplitRows") : $("adSplitRows");
  const rows = [];
  const seen = new Set();
  box?.querySelectorAll(".play-split-row").forEach((row) => {
    const id = row.querySelector(".play-split-person")?.value || "";
    const hours = roundHours(String(row.querySelector(".play-split-hours")?.value || "").replace(",", "."));
    if (!id || id === ownerId || hours <= 0 || seen.has(id)) return;
    seen.add(id);
    rows.push({ id, hours });
  });
  return rows;
}
function playableOwnerHoursEl(kind) {
  return kind === "dev" ? $("stProgHours") : $("stAdHours");
}
function playableSeatBox(kind) {
  return document.querySelector(`.play-seat-${kind}`);
}
function readPlayableOwnerHours(kind) {
  return roundHours(String(playableOwnerHoursEl(kind)?.value || "").replace(",", "."));
}
function playableSplitGiven(kind, ownerId) {
  return roundHours(readPlayableSplits(kind, ownerId).reduce((s, row) => s + row.hours, 0));
}
function readPlayableSeatPool(kind, ownerId) {
  const stored = roundHours(playableSeatBox(kind)?.dataset.pool);
  if (stored) return stored;
  return roundHours(readPlayableOwnerHours(kind) + playableSplitGiven(kind, ownerId));
}
function writePlayableSeatPool(kind, pool) {
  const box = playableSeatBox(kind);
  if (box) box.dataset.pool = String(roundHours(pool) || 0);
}
function playableSeatLive(kind, ownerId) {
  const given = playableSplitGiven(kind, ownerId);
  const pool = readPlayableSeatPool(kind, ownerId);
  const rest = roundHours(pool - given);
  return { pool, given, rest, owner: readPlayableOwnerHours(kind) };
}
function applyPlayablePoolToOwner(kind) {
  const ownerId = kind === "dev" ? $("stProgrammer")?.value || "" : $("stPerson")?.value || "";
  const el = playableOwnerHoursEl(kind);
  const box = playableSeatBox(kind);
  if (!el || !box) return;
  const given = playableSplitGiven(kind, ownerId);
  let pool = roundHours(box.dataset.pool);
  if (!pool) {
    pool = roundHours(readPlayableOwnerHours(kind) + given);
    box.dataset.pool = String(pool || 0);
  }
  const rest = roundHours(pool - given);
  el.value = rest > 0 ? String(rest) : given || pool ? "0" : "";
  el.classList.toggle("is-over", given > pool + 0.001);
}
function updatePlayablePoolFromOwner(kind) {
  const ownerId = kind === "dev" ? $("stProgrammer")?.value || "" : $("stPerson")?.value || "";
  writePlayableSeatPool(kind, readPlayableOwnerHours(kind) + playableSplitGiven(kind, ownerId));
}
function readPlayableCrewFromCard() {
  const ad = playableSeatLive("ad", $("stPerson")?.value || "");
  const dev = playableSeatLive("dev", $("stProgrammer")?.value || "");
  return roundHours(ad.pool + dev.pool);
}
function refreshPlayableCrew(t) {
  const ad = playableSeatLive("ad", $("stPerson")?.value || "");
  const dev = playableSeatLive("dev", $("stProgrammer")?.value || "");
  const crew = roundHours(ad.pool + dev.pool);
  if ($("playAdTotal")) {
    $("playAdTotal").textContent = `${ad.pool}h`;
    $("playAdTotal").hidden = !$("adSplitRows")?.querySelector(".play-split-row");
  }
  if ($("playDevTotal")) {
    $("playDevTotal").textContent = `${dev.pool}h`;
    $("playDevTotal").hidden = !$("devSplitRows")?.querySelector(".play-split-row");
  }
  $("stAdHours")?.classList.toggle("is-over", ad.given > ad.pool + 0.001);
  $("stProgHours")?.classList.toggle("is-over", dev.given > dev.pool + 0.001);
  const live = roundHours(crew + roundHours(t?.motionHours));
  if ($("playCrew")) $("playCrew").textContent = `${live}h`;
  const billedEl = $("playBilled");
  if (billedEl) {
    const buf = Math.max(0, $("stStudioBuffer") ? parseShifts($("stStudioBuffer").value) ?? 0 : playableStudioBuffer(t));
    billedEl.textContent = `${roundHours(live + buf)}h`;
  }
}
function refreshPlayableSplitSelects() {
  const adTaken = [$("stPerson")?.value, ...readPlayableSplits("ad", $("stPerson")?.value).map((row) => row.id)];
  const devTaken = [
    $("stProgrammer")?.value,
    ...readPlayableSplits("dev", $("stProgrammer")?.value).map((row) => row.id),
  ];
  $("adSplitRows")?.querySelectorAll(".play-split-row").forEach((row) => {
    const sel = row.querySelector(".play-split-person");
    const keep = sel?.value || "";
    if (!sel) return;
    sel.innerHTML = playableRoleOptions(artDirectors(), keep, adTaken, "ad");
    if (keep && [...sel.options].some((o) => o.value === keep)) sel.value = keep;
    else if (keep && keep === $("stPerson")?.value) row.remove();
    else sel.value = keep || "";
  });
  $("devSplitRows")?.querySelectorAll(".play-split-row").forEach((row) => {
    const sel = row.querySelector(".play-split-person");
    const keep = sel?.value || "";
    if (!sel) return;
    sel.innerHTML = playableRoleOptions(programmers(), keep, devTaken, "dev");
    if (keep && [...sel.options].some((o) => o.value === keep)) sel.value = keep;
    else if (keep && keep === $("stProgrammer")?.value) row.remove();
    else sel.value = keep || "";
  });
}
function bindPlayableCrew(t) {
  if (!canEditPlayableCrew()) return;
  const box = $("drawer")?.querySelector(".play-crew");
  if (!box) return;
  const paint = (e) => {
    const fromOwner = e?.target && (e.target.id === "stAdHours" || e.target.id === "stProgHours");
    if (fromOwner) {
      updatePlayablePoolFromOwner("ad");
      updatePlayablePoolFromOwner("dev");
    } else {
      applyPlayablePoolToOwner("ad");
      applyPlayablePoolToOwner("dev");
    }
    refreshPlayableSplitSelects();
    refreshPlayableCrew(t);
    $("drawer")?.dispatchEvent(new Event("input", { bubbles: true }));
  };
  box.addEventListener("input", paint);
  box.addEventListener("change", paint);
  $("stStudioBuffer")?.addEventListener("input", paint);
  const keepOutgoing = (sel, rowsId, kind, prevId, prevHours) => {
    const next = sel?.value || "";
    const started = playableStatusKey(t) !== "new";
    if (!started || !prevId || !next || next === prevId) return;
    const taken = new Set([next, ...readPlayableSplits(kind, next).map((row) => row.id)]);
    if (taken.has(prevId)) return;
    $(rowsId)?.insertAdjacentHTML(
      "beforeend",
      playableSplitRowHtml(kind, { id: prevId, hours: prevHours || 0.5 }, [...taken, prevId])
    );
  };
  $("stPerson")?.addEventListener("change", () => {
    keepOutgoing($("stPerson"), "adSplitRows", "ad", playableAdId(t), roundHours(t.assigneeHours) || 0.5);
    paint();
  });
  $("stProgrammer")?.addEventListener("change", () => {
    keepOutgoing(
      $("stProgrammer"),
      "devSplitRows",
      "dev",
      t.programmerId,
      roundHours(t.programmerHours) || 0.5
    );
    paint();
  });
  const addSplit = (kind) => {
    const ownerSel = kind === "dev" ? $("stProgrammer") : $("stPerson");
    const rowsId = kind === "dev" ? "devSplitRows" : "adSplitRows";
    const title = kind === "dev" ? "DEV" : "AD";
    const list = kind === "dev" ? programmers() : artDirectors();
    if (!ownerSel?.value) {
      toast(`Assign ${title} first, then split onto another ${title}`);
      return;
    }
    applyPlayablePoolToOwner(kind);
    const seat = playableSeatLive(kind, ownerSel.value);
    if (seat.pool <= 0) {
      toast(`Set ${title} hours first, then split onto another ${title}`);
      return;
    }
    if (seat.rest <= 0) {
      toast(`No ${title} hours left to split — raise the seat hours or lower an existing row`);
      return;
    }
    const box = $(rowsId);
    const blank = [...(box?.querySelectorAll(".play-split-person") || [])].some((sel) => !sel.value);
    if (blank) {
      toast(`Pick the ${title} on the empty row first`);
      return;
    }
    const taken = new Set([ownerSel.value, ...readPlayableSplits(kind, ownerSel.value).map((row) => row.id)]);
    const next = list.find((p) => !taken.has(p.id));
    if (!next) {
      toast(
        list.length
          ? `Only ${person(ownerSel.value)?.name || title} is on the team as ${title}. DL adds another in Team.`
          : `No ${title} on the team yet. DL adds one in Team.`
      );
      return;
    }
    const slice = Math.min(0.5, seat.rest);
    box?.insertAdjacentHTML(
      "beforeend",
      playableSplitRowHtml(kind, { id: next?.id || "", hours: next ? slice : "" }, [...taken, next?.id])
    );
    paint();
  };
  $("adSplitAdd")?.addEventListener("click", () => addSplit("ad"));
  $("devSplitAdd")?.addEventListener("click", () => addSplit("dev"));
  box.addEventListener("click", (e) => {
    const btn = e.target.closest(".help-del");
    if (!btn) return;
    btn.closest(".play-split-row")?.remove();
    paint();
  });
}
function helpSplitHtml(t, editable) {
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
      <div class="help-owner"><span>${escapeHtml(ownerName)}</span><b id="helpRemainder">${ownerH}h</b></div>
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
    (hint.closest(".help-owner").querySelector("span").textContent = name);
  hint.textContent = `${rest}h`;
  hint.classList.toggle("is-over", given > total + 0.001);
}
function bindHelpSplit(t) {
  const box = $("drawer")?.querySelector(".help-split");
  if (!box || !canEditHelp()) return;
  const paint = () => {
    refreshHelpRemainder(t);
    $("drawer")?.dispatchEvent(new Event("input", { bubbles: true }));
  };
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

function cardRemoteStamp(t) {
  if (!t) return "";
  return JSON.stringify({
    name: t.name || "",
    studioStatus: t.studioStatus || "",
    assigneeId: t.assigneeId || "",
    programmerId: t.programmerId || "",
    hours: t.hours || 0,
    shifts: t.shifts || 0,
    assigneeHours: t.assigneeHours || 0,
    programmerHours: t.programmerHours || 0,
    studioBuffer: t.studioBuffer || 0,
    help: t.help || [],
    programmerHelp: t.programmerHelp || [],
    resultUrl: t.resultUrl || "",
    deadline: t.deadline || "",
    urgent: Boolean(t.urgent),
    brief: t.brief || "",
  });
}
function othersOnOpenCard() {
  const id = state.openId;
  if (!id) return [];
  return (state.presence?.[id] || []).filter((row) => !row.self);
}
function paintCardWatch() {
  const el = $("cardWatch");
  if (!el) return;
  const names = othersOnOpenCard()
    .map((row) => row.name || row.role)
    .filter(Boolean);
  const uniq = [...new Set(names)];
  const bits = [];
  if (uniq.length) {
    bits.push(
      uniq.length === 1
        ? `${uniq[0]} is on this card`
        : `${uniq.join(", ")} are on this card`
    );
  }
  if (state.cardStale) bits.push("The card changed while it was open. Save will overwrite that write.");
  el.hidden = !bits.length;
  el.classList.toggle("is-stale", Boolean(state.cardStale));
  el.textContent = bits.join(". ");
}
let presenceTimer = 0;
function stopCardPresence() {
  clearInterval(presenceTimer);
  presenceTimer = 0;
  api("/api/presence", { id: "" });
}
function startCardPresence(id) {
  if (!id || isClient()) return;
  api("/api/presence", { id }).then((out) => {
    if (out?.presence) {
      state.presence = out.presence;
      paintCardWatch();
    }
  });
  if (!presenceTimer) {
    presenceTimer = window.setInterval(() => {
      if (!state.openId) return;
      api("/api/presence", { id: state.openId }).then((out) => {
        if (out?.presence) {
          state.presence = out.presence;
          paintCardWatch();
        }
      });
    }, 8000);
  }
}

function openTask(id) {
  if (isClient()) return;
  const t = state.db.tasks.find((x) => x.id === id);
  if (!t) return;
  state.openId = id;
  state.cardOpenedStamp = cardRemoteStamp(t);
  state.cardStale = false;
  const mine = onMyPlayable(t);
  const canEdit = canOps() || canAssign() || mine;
  const lockedStatus = (t.studioStatus === "approve" || t.studioStatus === "closed") && !canOps();
  const job = withUrgentCue(t, cardJob(t));
  const play = isPlayables(t);
  const performer = mine && (isDesigner() || isTeamLead() || isArtDirector() || isProgrammer());
  const canPaste = canPasteResult(t);
  const assignHero = isTeamLead() && !t.assigneeId && !play;
  const mayAssign = play ? canAssignPlayable() : canAssign();
  const assignSelect = !play && mayAssign
    ? `<select id="stPerson">
        <option value="">— unassigned</option>
        ${designers()
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
  const showAssignee = !isPerformer() && !assignHero && !play;
  const whoAssign = showAssignee
    ? `<div class="who-assign"><label>Who works this</label>${mayAssign ? assignSelect : personCell(t.assigneeId)}</div>`
    : "";
  const opsUrgent = canOps()
    ? `<div class="ops-item">
        <label>Flag</label>
        <button type="button" class="urgent-toggle${isUrgent(t) ? " is-on" : ""}" id="stUrgentBtn" aria-pressed="${isUrgent(t) ? "true" : "false"}">
          <span class="urgent-mark" aria-hidden="true">!</span> URGENT
        </button>
        <input type="hidden" id="stUrgent" value="${isUrgent(t) ? "1" : "0"}" />
      </div>`
    : "";
  const opsTime = canEditTime() && !play
    ? `<div class="ops-item"><label>Shifts</label>
        <input id="stShifts" type="number" min="0" step="0.1" value="${t.shifts ?? ""}" />
        <p class="status-hint" id="stHoursHint">${hoursFromShifts(t.shifts || 0)} h</p></div>
       <div class="ops-item"><label>Dead Line</label>
        <input id="stDeadline" type="date" value="${parseDeadlineIso(t.deadline)}" />
        </div>${opsUrgent}`
    : canEditTime() && play
      ? `<div class="ops-item"><label>Dead Line</label>
        <input id="stDeadline" type="date" value="${parseDeadlineIso(t.deadline)}" />
        </div>${opsUrgent}`
      : opsUrgent;
  const statusKeys = statusActions(t);
  const statusChrome = statusKeys.length
    ? `<div class="who-status">
        <label>Status</label>
        ${statusButtonsHtml(t, canEdit, lockedStatus)}
      </div>`
    : `<input type="hidden" id="stStatus" value="${escapeHtml(t.studioStatus || "new")}" />
      <p class="status-hint" id="stDoneHint" hidden></p>`;
  const whoBlock = whoAssign || statusKeys.length
    ? `<section class="who-block">
      ${whoAssign}
      ${statusChrome}
    </section>`
    : statusChrome;
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
    <div class="meta"><span class="pill line-${t.line}">${t.line}</span> ${isUrgent(t) ? `<span class="urgent-flag">${urgentMark(t)} URGENT</span>` : ""} ${play ? (playableCardMeta(t) ? `${playableCardMeta(t)} · ` : "") : `${t.shifts || 0} shift · ${t.hours || 0} h · `}<span id="stMetaStatus" class="pill ${st.cls}">${statusText(t.studioStatus || "new", t)}</span></div>
    <p class="card-watch" id="cardWatch" hidden></p>
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
    ${play ? playableHoursHtml(t, canEditPlayableCrew()) : helpSplitHtml(t, canEditHelp())}
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
        ${canEdit || canOps() ? `<button type="button" class="btn primary card-save" id="saveTask" disabled>Save</button>` : ""}
      </div>
    </div>
  `;
  const pendingShots = [];
  function cardFingerprint() {
    const d = $("drawer");
    if (!d) return "";
    const vals = [...d.querySelectorAll("input, textarea, select")]
      .filter((el) => el.type !== "file")
      .map((el) => `${el.id || el.className}=${el.value}`);
    return JSON.stringify({
      vals,
      shots: pendingShots.length,
      splits: d.querySelectorAll(".help-row, .play-split-row").length,
    });
  }
  let cardBaseline = "";
  function refreshAddNote() {
    const ready = Boolean(String($("stComment")?.value || "").trim() || pendingShots.length);
    setIdleEnabled($("addNote"), ready);
  }
  function refreshCardSave() {
    const on = cardFingerprint() !== cardBaseline;
    const btn = $("saveTask");
    setIdleEnabled(btn, on);
    btn?.classList.toggle("is-ready", on);
  }
  function refreshCardActions() {
    refreshAddNote();
    refreshCardSave();
  }
  state.cardDirty = () => Boolean($("saveTask") || $("addNote")) && cardFingerprint() !== cardBaseline;
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
    refreshCardActions();
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
    const rawBytes = pendingShots.reduce((n, s) => n + String(s.data || "").length, 0);
    if (rawBytes > MAX_NOTE_BYTES) {
      toast(noteError("payload too large"), 5000);
      return false;
    }
    const out = await api(
      "/api/tasks/comment",
      {
        id: t.id,
        body,
        attachments: pendingShots.map((s) => ({ mime: s.mime, data: s.data })),
        actorId: me().id,
        role: me().role,
      },
      { timeout: 90000 },
    );
    if (out.error || !out.state) {
      toast(noteError(out.error), 5000);
      return false;
    }
    pendingShots.length = 0;
    applyState(out.state, { render: reopen !== false });
    toast("Note added");
    if (reopen) openTask(t.id);
    else {
      if ($("stComment")) $("stComment").value = "";
      renderPendingShots();
    }
    return true;
  }
  $("addNote")?.addEventListener("click", () => {
    if ($("addNote")?.disabled) return;
    postClientNote();
  });
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
    ["tlcheck", "check", "done"].forEach((key) => {
      const btn = $("drawer")?.querySelector(`.status-btn[data-status="${key}"]`);
      if (btn && (t.studioStatus || "new") !== key) {
        btn.disabled = statusButtonDisabled(t, key, {
          canEdit,
          locked: lockedStatus,
          typedResult: typed,
        });
      }
    });
    if (hint) {
      const playSt = playableStatusKey(t);
      if (isPlayables(t)) {
        if (isProgrammer() && !hasResult && (playSt === "wip" || playSt === "revision" || playSt === "artready")) {
          hint.textContent = "Paste the HTML link, then Done.";
        } else if (isArtDirector() && playSt === "new") {
          hint.textContent = "WIP when you start. Paste the storyboard link, then Check.";
        } else if (isArtDirector() && playSt === "wip") {
          hint.textContent = "Paste the storyboard link, then Check so LP can send it.";
        } else if (isArtDirector() && playSt === "revision") {
          hint.textContent = "Fix, set WIP, then Check.";
        } else if (isArtDirector() && playSt === "finalart") {
          hint.textContent = "Art ready when DEV can start HTML.";
        } else if (isProgrammer() && playSt === "done") {
          hint.textContent = "LP sends this. Need Fixing if the HTML needs another pass.";
        } else if (canOps() && playSt === "check") {
          hint.textContent = "Send to client — that sets Sent. Only LP talks to SuperPlay.";
        } else if (canOps() && playSt === "done") {
          hint.textContent = "Send to client, or Mark Closed if they already accepted.";
        } else if (canOps() && playSt === "approve") {
          hint.textContent = "Client accepted → Closed. Bounced → Need Fixing for DEV.";
        } else if (canOps() && playSt === "clientart") {
          hint.textContent = "Need Fixing if they bounce it. Final art when they approve the board.";
        } else if (canOps() && playSt === "artready" && !t.programmerId) {
          hint.textContent = "Assign DEV if they are not on the card yet.";
        } else {
          hint.textContent = "";
        }
      } else if (performer && t.studioStatus === "tlcheck") {
        hint.textContent = "Waiting for TL. Need Fixing comes from TL or LP — not WIP.";
      } else if (performer && !hasResult && !["tlcheck", "done", "approve", "closed"].includes(t.studioStatus)) {
        hint.textContent = "Paste the result link, then TL Check. The chip writes at once.";
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
      if (isPlayables(t) && key === "check" && !($("stResult")?.value || t.resultUrl || "").trim()) {
        toast("Paste the storyboard link before Check");
        return;
      }
      if (isPlayables(t) && key === "done" && !($("stResult")?.value || t.resultUrl || "").trim()) {
        toast("Paste the HTML link before Done");
        return;
      }
      if (key === "tlcheck" && !($("stResult")?.value || t.resultUrl || "").trim()) {
        toast("Paste the result link before TL Check");
        return;
      }
      if (!isPlayables(t) && key === "done" && t.studioStatus !== "tlcheck" && $("stStatus")?.value !== "tlcheck" && !canOps()) {
        toast("Done is after TL Check");
        return;
      }
      if (key !== t.studioStatus && !canSetStatus(key, t) && !(key === "closed" && canOps())) {
        toast("This role cannot set " + (STATUS[key]?.label || key));
        return;
      }
      commitCard({ fromChip: true, status: key });
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
  async function commitCard(opts = {}) {
    const fromChip = Boolean(opts.fromChip);
    const saveBtn = $("saveTask");
    if (!fromChip && (saveBtn?.disabled || saveBtn?.classList.contains("is-busy"))) return;
    if (fromChip && saveBtn?.classList.contains("is-busy")) return;
    if (
      state.cardStale &&
      !confirm("This card changed while it was open. Save anyway and overwrite the other write?")
    ) {
      return;
    }
    const actionBtns = () => $("drawer")?.querySelectorAll(".drawer-actions button, .status-btn") || [];
    const hint = $("saveWait");
    const startBusy = (label) => {
      if (hint) {
        hint.hidden = false;
        hint.textContent = label || "Saving…";
      }
      actionBtns().forEach((btn) => setBusy(btn, true, btn.id === "saveTask" ? "Saving…" : undefined));
    };
    const stopBusy = () => {
      if (hint) hint.hidden = true;
      actionBtns().forEach((btn) => setBusy(btn, false));
    };
    try {
    if (canWriteNotes() && (String($("stComment")?.value || "").trim() || pendingShots.length)) {
      const n = pendingShots.length;
      startBusy(n ? `Saving ${n} screenshot${n === 1 ? "" : "s"}…` : "Saving…");
      const ok = await postClientNote({ reopen: false });
      if (!ok) return;
    }
    const resultUrl = ($("stResult")?.value || t.resultUrl || "").trim();
    const studioStatus = opts.status || $("stStatus")?.value || t.studioStatus;
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
    if (isPlayables(t) && studioStatus === "check" && !resultUrl) {
      toast("Paste the storyboard link before Check");
      return;
    }
    if (isPlayables(t) && studioStatus === "done" && !resultUrl) {
      toast("Paste the HTML link before Done");
      return;
    }
    if (studioStatus === "tlcheck" && !resultUrl) {
      toast("Paste the result link before TL Check");
      return;
    }
    if (!isPlayables(t) && studioStatus === "done" && !resultUrl) {
      toast("Paste the result link before Done");
      return;
    }
    if (!isPlayables(t) && studioStatus === "done" && t.studioStatus !== "tlcheck" && t.studioStatus !== "done" && !canOps()) {
      toast("Done is after TL Check");
      return;
    }
    const mayAssign = isPlayables(t) ? canAssignPlayable() : canAssign();
    let assigneeId = mayAssign && $("stPerson") ? $("stPerson").value : isPlayables(t) ? playableAdId(t) : t.assigneeId;
    const patch = { studioStatus, role: me().role };
    if (isPlayables(t) && mayAssign && $("stProgrammer")) patch.programmerId = $("stProgrammer").value;
    if (isPlayables(t) && isFinance() && $("stStudioBuffer")) {
      const buf = parseShifts($("stStudioBuffer").value);
      if (buf === null) {
        toast("Studio buffer must be 0 or more");
        return;
      }
      patch.studioBuffer = buf;
    }
    if (isPlayables(t) && canEditPlayableCrew() && $("stAdHours")) {
      applyPlayablePoolToOwner("ad");
      applyPlayablePoolToOwner("dev");
      const adSplits = readPlayableSplits("ad", assigneeId);
      const adLive = playableSeatLive("ad", assigneeId);
      if (adLive.given > adLive.pool + 0.001) {
        toast("Split hours cannot exceed the AD hours on this task");
        return;
      }
      const adSeat = takePlayableOwner(
        assigneeId,
        adLive.rest,
        adSplits,
        readPlayableSplitIds("ad")
      );
      assigneeId = adSeat.ownerId;
      patch.assigneeHours = adSeat.ownerHours;
      patch.help = adSeat.splits;
      const programmerId = patch.programmerId !== undefined ? patch.programmerId : t.programmerId;
      const devSplits = readPlayableSplits("dev", programmerId);
      const devLive = playableSeatLive("dev", programmerId);
      if (devLive.given > devLive.pool + 0.001) {
        toast("Split hours cannot exceed the DEV hours on this task");
        return;
      }
      const devSeat = takePlayableOwner(
        programmerId,
        devLive.rest,
        devSplits,
        readPlayableSplitIds("dev")
      );
      patch.programmerId = devSeat.ownerId;
      patch.programmerHours = devSeat.ownerHours;
      patch.programmerHelp = devSeat.splits;
    }
    if (
      isPlayables(t) &&
      assigneeId &&
      (assigneeId === (patch.programmerId !== undefined ? patch.programmerId : t.programmerId) ||
        (person(assigneeId)?.role && person(assigneeId).role !== "art_director"))
    ) {
      assigneeId = "";
    }
    if (mayAssign) patch.assigneeId = assigneeId;
    if (!isPlayables(t) && canEditHelp()) {
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
    if (canOps() && $("stUrgent")) {
      patch.urgent = $("stUrgent").value === "1";
    }
    if (studioStatus === "closed") patch.urgent = false;
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
        : patch.urgent !== undefined && Boolean(patch.urgent) !== Boolean(t.urgent)
          ? patch.urgent
            ? `${me().name} marked URGENT`
            : `${me().name} cleared URGENT`
          : resultUrl && resultUrl !== t.resultUrl
            ? `${me().name} pasted the result`
            : `${me().name} updated status`;
    startBusy("Saving…");
      await updateTask(t.id, { ...patch, note }, { close: !fromChip });
    } catch (err) {
      toast(err?.message || "Could not save", 5000);
    } finally {
      stopBusy();
    }
  }
  $("saveTask")?.addEventListener("click", () => commitCard());
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
        urgent: false,
        role: me().role,
        note: `${me().name} marked Closed (client accepted)`,
      },
      { close: true }
    );
  });
  if (isPlayables(t)) bindPlayableCrew(t);
  else bindHelpSplit(t);
  const writeAssign = () => commitCard({ fromChip: true });
  $("stPerson")?.addEventListener("change", writeAssign);
  $("stProgrammer")?.addEventListener("change", writeAssign);
  state.commitCard = commitCard;
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
  cardBaseline = cardFingerprint();
  $("stUrgentBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const on = $("stUrgent")?.value !== "1";
    if ($("stUrgent")) $("stUrgent").value = on ? "1" : "0";
    $("stUrgentBtn").classList.toggle("is-on", on);
    $("stUrgentBtn").setAttribute("aria-pressed", on ? "true" : "false");
    refreshCardActions();
  });
  $("drawer")?.addEventListener("input", refreshCardActions);
  $("drawer")?.addEventListener("change", refreshCardActions);
  $("stComment")?.addEventListener("input", refreshCardActions);
  refreshCardActions();
  paintCardWatch();
  startCardPresence(id);
}

function hideCardSaveModal() {
  $("cardSaveModal")?.classList.remove("show");
}

function closeDrawer(opts = {}) {
  closeShot();
  if (!opts.force && $("cardSaveModal")?.classList.contains("show")) {
    hideCardSaveModal();
    return false;
  }
  if (
    !opts.force &&
    $("drawerBg")?.classList.contains("show") &&
    typeof state.cardDirty === "function" &&
    state.cardDirty()
  ) {
    $("cardSaveModal")?.classList.add("show");
    $("cardSaveKeep")?.focus();
    return false;
  }
  hideCardSaveModal();
  $("drawerBg").classList.remove("show");
  stopCardPresence();
  state.openId = null;
  state.cardDirty = null;
  state.commitCard = null;
  state.cardOpenedStamp = "";
  state.cardStale = false;
  return true;
}

async function updateTask(id, patch, opts = {}) {
  const out = await api("/api/tasks/update", { id, actorId: me().id, ...patch });
  if (out.error || !out.state) {
    toast(out.error || "Could not save");
    return false;
  }
  applyState(out.state);
  if (opts.quiet) {
    /* pipeline steppers save without a toast so the row stays put */
  } else if (out.drive && out.drive.ok === false && patch.brief != null) {
    toast(out.drive.error || "Saved on the board, not on Drive");
  } else if (out.drive?.rename?.renamed) {
    toast("Renamed on the board, Drive folder, and brief Doc");
  } else {
    toast("Saved");
  }
  if (opts.close) {
    closeDrawer({ force: true });
    return true;
  }
  if (state.openId && $("drawerBg").classList.contains("show")) openTask(id);
  return true;
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
    toast("Send only works on Check / Done projects");
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
  if (typeof state.cardDirty === "function" && state.cardDirty()) return true;
  const t = state.db?.tasks?.find((x) => x.id === state.openId);
  if (!t) return false;
  const active = document.activeElement;
  if (active && $("drawer")?.contains(active) && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) {
    return true;
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
    closeDrawer({ force: true });
    toast("This project was removed");
    return;
  }
  const live = (db.tasks || []).find((row) => row.id === openId);
  if (live && cardRemoteStamp(live) !== state.cardOpenedStamp) {
    state.cardStale = true;
    paintCardWatch();
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
      if (out.presence) {
        state.presence = out.presence;
        paintCardWatch();
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
  state.hoursDir = null;
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
  stopCardPresence();
  api("/api/logout", {});
  writeSession(null);
  state.roleId = "manager";
  state.view = "board";
  state.selected.clear();
  state.designerFilter = null;
  state.hoursDir = null;
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
  if (state.view === "close" || state.view === "team" || state.view === "report") state.view = "board";
  setDirection("mgx");
});
$("navPlay")?.addEventListener("click", () => {
  if (isClient()) return;
  if (state.view === "close" || state.view === "team" || state.view === "report") state.view = "board";
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
$("navClientSuperplay")?.addEventListener("click", () => {
  if (!isFinance()) return;
  state.view = "report";
  state.hoursClient = "superplay";
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
$("pasteText")?.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || e.shiftKey || e.isComposing) return;
  e.preventDefault();
  $("pasteCopy")?.click();
});
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
$("createTaskName")?.addEventListener("input", refreshCreateGo);
$("createTaskForm")?.addEventListener("submit", (e) => {
  e.preventDefault();
  submitCreateTask();
});
$("createTaskModal")?.addEventListener("click", (e) => {
  if (e.target === $("createTaskModal")) closeCreateTask();
});
$("emailCancel").onclick = () => $("emailModal").classList.remove("show");
$("emailText")?.addEventListener("input", refreshEmailGo);
$("emailApply").onclick = async () => {
  const go = $("emailApply");
  if (go?.disabled || go?.classList.contains("is-busy")) return;
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
$("cardSaveModal")?.addEventListener("click", (e) => {
  if (e.target === $("cardSaveModal")) hideCardSaveModal();
});
$("cardSaveDiscard")?.addEventListener("click", () => {
  hideCardSaveModal();
  closeDrawer({ force: true });
});
$("cardSaveKeep")?.addEventListener("click", async () => {
  hideCardSaveModal();
  const fn = state.commitCard;
  if (typeof fn === "function") {
    await fn({ close: true });
    return;
  }
  closeDrawer({ force: true });
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if ($("cardSaveModal")?.classList.contains("show")) {
    hideCardSaveModal();
    return;
  }
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
      location.replace("/superplay");
      return;
    }
    enterStudio();
    render();
  })
  .catch(() => {
    if (isStudioHost()) showLogin();
    else showNeedServer();
  });
