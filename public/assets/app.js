const STATUS = {
  imported: { label: "Новий", cls: "status-imported" },
  todo: { label: "До роботи", cls: "status-todo" },
  doing: { label: "В роботі", cls: "status-doing" },
  done: { label: "Здано", cls: "status-done" },
  sent: { label: "У клієнта", cls: "status-sent" },
  fix: { label: "Правки", cls: "status-fix" },
};

const GROUPS_OPS = [
  { id: "new", title: "Щойно з клієнта", color: "#c4c4c4", statuses: ["imported"] },
  { id: "ready", title: "До роботи", color: "#fdab3d", statuses: ["todo"] },
  { id: "wip", title: "В роботі", color: "#579bfc", statuses: ["doing"] },
  { id: "done", title: "Здано — на апрув", color: "#00c875", statuses: ["done"] },
  { id: "sent", title: "Вже у клієнта", color: "#66ccff", statuses: ["sent"] },
  { id: "fix", title: "Правки", color: "#e2445c", statuses: ["fix"] },
];

const GROUPS_EXEC = [
  { id: "free", title: "Ще вільні", color: "#c4c4c4", statuses: ["imported", "todo"] },
  { id: "wip", title: "В роботі", color: "#579bfc", statuses: ["doing"] },
  { id: "done", title: "Здано", color: "#00c875", statuses: ["done", "sent"] },
  { id: "fix", title: "Правки", color: "#e2445c", statuses: ["fix"] },
];

const ROLE_LABEL = { finance: "фінанси", manager: "менеджер", executor: "виконавець" };

const state = { db: null, roleId: "dmytro", view: "board", selected: new Set(), openId: null };
const $ = (id) => document.getElementById(id);

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function person(id) {
  return (state.db.people || []).find((p) => p.id === id);
}
function me() {
  return person(state.roleId) || state.db.people[0];
}
function isFinance() {
  return me().role === "finance";
}
function isExecutor() {
  return me().role === "executor";
}
function canOps() {
  return me().role === "manager" || me().role === "finance";
}

function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 3200);
}

async function api(path, payload) {
  const res = await fetch(path, {
    method: payload ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  return res.json();
}

function visibleTasks() {
  const q = (document.querySelector(".search")?.value || "").toLowerCase();
  const mine = state.view === "mine";
  return state.db.tasks.filter((t) => {
    if (q && !`${t.name} ${t.brief}`.toLowerCase().includes(q)) return false;
    if (mine && t.assigneeId !== state.roleId) return false;
    return true;
  });
}

function renderWho() {
  $("who").innerHTML = state.db.people
    .map(
      (p) =>
        `<option value="${p.id}" ${p.id === state.roleId ? "selected" : ""}>${escapeHtml(p.name)} · ${
          ROLE_LABEL[p.role] || p.role
        }</option>`
    )
    .join("");
}

function renderChrome() {
  $("financeNav").hidden = !isFinance();
  $("roleHint").textContent = isExecutor()
    ? "Вам: хто що робить, скільки часу, бриф і куди здати результат. Грошей тут немає."
    : canOps() && !isFinance()
      ? "Постановка: забрати з Monday, назнати людей, віддати здані таски клієнту."
      : "Ви бачите постановку і окремо фінанси. Інвойси — лише тут, виконавцям їх не видно.";
  $("sideFoot").innerHTML = isFinance()
    ? "Пісочниця Drive: _PORTAL_TEST<br>Бойовий October не чіпаємо."
    : isExecutor()
      ? "Здаєте лінк у картці проекту. Monday вам не потрібен."
      : "Імпорт / експорт Monday — ваші кнопки. Фінанси бачить лише Дмитро.";

  const tabs = [];
  tabs.push({ id: "board", label: isExecutor() ? "Усі проекти" : "Постановка" });
  if (isExecutor()) tabs.push({ id: "mine", label: "Мої" });
  if (canOps()) tabs.push({ id: "ready", label: "Готові здати клієнту" });
  if (isFinance()) tabs.push({ id: "close", label: "Фінанси" });
  if (!tabs.some((t) => t.id === state.view)) state.view = "board";
  $("views").innerHTML = tabs
    .map(
      (t) =>
        `<button class="view-tab ${state.view === t.id ? "active" : ""}" data-view="${t.id}">${t.label}</button>`
    )
    .join("");
  $("views").querySelectorAll(".view-tab").forEach((el) => {
    el.addEventListener("click", () => {
      state.view = el.dataset.view;
      render();
    });
  });
}

function renderToolbar() {
  const n = state.selected.size;
  if (isExecutor()) {
    $("toolbar").innerHTML = `<input class="search" placeholder="Знайти проект" />`;
  } else {
    $("toolbar").innerHTML = `
      <button class="btn primary" id="btnImport">Забрати з Monday</button>
      <button class="btn orange" id="btnEmail">Лист зі shift</button>
      <button class="btn" id="btnFolders" ${n ? "" : "disabled"}>Теки (${n})</button>
      <button class="btn green" id="btnExport" ${n ? "" : "disabled"}>Віддати клієнту (${n})</button>
      <input class="search" placeholder="Пошук проекту" />
      <button class="btn ghost" id="btnReset">Скинути демо</button>
    `;
  }
  $("toolbar").querySelector(".search")?.addEventListener("input", render);
  $("btnImport")?.addEventListener("click", importMonday);
  $("btnEmail")?.addEventListener("click", () => $("emailModal").classList.add("show"));
  $("btnFolders")?.addEventListener("click", provision);
  $("btnExport")?.addEventListener("click", exportMonday);
  $("btnReset")?.addEventListener("click", resetDemo);
}

function renderKpis() {
  if (state.view === "close") {
    $("kpis").innerHTML = "";
    return;
  }
  const tasks = visibleTasks();
  if (isExecutor()) {
    const mine = state.db.tasks.filter((t) => t.assigneeId === me().id);
    const hours = mine.reduce((s, t) => s + (Number(t.hours) || 0), 0);
    $("kpis").innerHTML = `
      <div class="kpi"><b>${tasks.length}</b><span>проектів на дошці</span></div>
      <div class="kpi"><b>${mine.length}</b><span>назначено мені</span></div>
      <div class="kpi"><b>${hours.toFixed(1)} h</b><span>мій час у цьому місяці</span></div>
    `;
    return;
  }
  const hours = state.db.tasks.reduce((s, t) => s + (Number(t.hours) || 0), 0);
  const ready = state.db.tasks.filter((t) => t.studioStatus === "done").length;
  const money = isFinance()
    ? `<div class="kpi"><b>$${(hours * 35).toFixed(0)}</b><span>чорновик інвойсу × $35</span></div>`
    : "";
  $("kpis").innerHTML = `
    <div class="kpi"><b>${state.db.tasks.length}</b><span>проектів</span></div>
    <div class="kpi"><b>${hours.toFixed(1)} h</b><span>годин у постановці</span></div>
    <div class="kpi"><b>${ready}</b><span>чекають відправки клієнту</span></div>
    ${money}
  `;
}

function initials(name) {
  return (name || "?").slice(0, 1);
}
function personCell(id) {
  const p = person(id);
  if (!p) return `<span class="empty">вільний</span>`;
  return `<span class="person"><span class="avatar" style="background:${p.color}">${initials(p.name)}</span>${escapeHtml(p.name)}</span>`;
}
function timeCell(t) {
  if (!t.shifts && !t.hours) return `<span class="empty">—</span>`;
  return `${t.shifts || "—"} / ${t.hours || "—"}h`;
}

function renderBoard() {
  if (state.view === "close") {
    renderClose();
    return;
  }
  const exec = isExecutor();
  const groups = exec ? GROUPS_EXEC : GROUPS_OPS;
  let tasks = visibleTasks();
  if (state.view === "ready") tasks = tasks.filter((t) => t.studioStatus === "done");
  const mode = exec ? "exec" : "ops";
  const head = exec
    ? `<div class="cols exec"><div>Проект</div><div>Хто робить</div><div>Час</div><div>Бриф</div><div>Результат</div><div>Статус</div></div>`
    : `<div class="cols ops"><div></div><div>Проект</div><div>Лінія</div><div>Час</div><div>Хто</div><div>Статус</div><div>Бриф</div><div>Результат</div></div>`;

  $("board").innerHTML = groups
    .map((g) => {
      const rows = tasks.filter((t) => g.statuses.includes(t.studioStatus));
      if (state.view === "ready" && g.id !== "done") return "";
      return `
      <section class="group">
        <div class="group-head">
          <span class="gdot" style="background:${g.color}"></span>
          <h3 style="color:${g.color}">${g.title}</h3>
          <span class="count">${rows.length}</span>
        </div>
        ${head}
        ${
          rows.length
            ? rows.map((t) => rowHtml(t, mode)).join("")
            : `<div class="cell empty" style="padding:12px 16px">Порожньо</div>`
        }
      </section>`;
    })
    .join("");

  $("board").querySelectorAll(".row").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.closest("input,select,a,button")) return;
      openTask(el.dataset.id);
    });
  });
  $("board").querySelectorAll(".chk").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = el.dataset.id;
      if (el.checked) state.selected.add(id);
      else state.selected.delete(id);
      renderToolbar();
    });
  });
}

function rowHtml(t, mode) {
  const st = STATUS[t.studioStatus] || STATUS.todo;
  const checked = state.selected.has(t.id) ? "checked" : "";
  const brief = t.docUrl
    ? `<a class="linkish" href="${escapeHtml(t.docUrl)}" target="_blank" rel="noreferrer">Бриф</a>`
    : t.brief
      ? `<span class="linkish">є текст</span>`
      : `<span class="empty">немає</span>`;
  const result = t.resultUrl
    ? `<a class="linkish" href="${escapeHtml(t.resultUrl)}" target="_blank" rel="noreferrer">Лінк</a>`
    : `<span class="empty">вставити</span>`;
  if (mode === "exec") {
    return `
      <div class="row exec" data-id="${t.id}">
        <div class="cell name" title="${escapeHtml(t.name)}">${escapeHtml(t.name)}</div>
        <div class="cell">${personCell(t.assigneeId)}</div>
        <div class="cell">${timeCell(t)}</div>
        <div class="cell">${brief}</div>
        <div class="cell">${result}</div>
        <div class="cell"><span class="pill ${st.cls}">${st.label}</span></div>
      </div>`;
  }
  return `
    <div class="row ops ${checked ? "selected" : ""}" data-id="${t.id}">
      <div class="cell"><input class="chk" data-id="${t.id}" type="checkbox" ${checked} /></div>
      <div class="cell name" title="${escapeHtml(t.name)}">${escapeHtml(t.name)}</div>
      <div class="cell"><span class="pill line-${t.line}">${t.line}</span></div>
      <div class="cell">${timeCell(t)}</div>
      <div class="cell">${personCell(t.assigneeId)}</div>
      <div class="cell"><span class="pill ${st.cls}">${st.label}</span></div>
      <div class="cell">${brief}</div>
      <div class="cell">${result}</div>
    </div>`;
}

function renderClose() {
  if (!isFinance()) {
    state.view = "board";
    render();
    return;
  }
  const byLine = { DD: 0, DX: 0, DS: 0 };
  for (const t of state.db.tasks) byLine[t.line] = (byLine[t.line] || 0) + (Number(t.hours) || 0);
  const people = {};
  for (const t of state.db.tasks) {
    if (!t.assigneeId) continue;
    const p = person(t.assigneeId);
    if (!p || p.role !== "executor") continue;
    people[t.assigneeId] = (people[t.assigneeId] || 0) + (Number(t.hours) || 0);
  }
  $("board").innerHTML = `
    <section class="group" style="padding:18px">
      <h2 style="margin:0 0 8px">Фінанси · жовтень</h2>
      <p style="color:#676879">Цього екрана немає у виконавця і в менеджера. Тут лише ви: інвойс клієнту і години людей після 15-го.</p>
      <div class="kpis" style="padding:0 0 16px">
        <div class="kpi"><b>${byLine.DD.toFixed(1)} h</b><span>DD × $35 = $${(byLine.DD * 35).toFixed(0)}</span></div>
        <div class="kpi"><b>${byLine.DX.toFixed(1)} h</b><span>DX × $35 = $${(byLine.DX * 35).toFixed(0)}</span></div>
        <div class="kpi"><b>${byLine.DS.toFixed(1)} h</b><span>DS</span></div>
      </div>
      <h3>Гонорари людей @ $15/год</h3>
      ${Object.entries(people)
        .map(([id, h]) => `<div style="padding:8px 0;border-bottom:1px solid #f0f1f5">${personCell(id)} — <b>${h.toFixed(1)} h</b> · $${(h * 15).toFixed(0)}</div>`)
        .join("")}
    </section>`;
}

function executorStatuses() {
  return ["todo", "doing", "done", "fix"];
}

function openTask(id) {
  const t = state.db.tasks.find((x) => x.id === id);
  if (!t) return;
  state.openId = id;
  const mine = t.assigneeId === me().id;
  const canEdit = canOps() || mine || (!t.assigneeId && isExecutor());
  const statusOpts = (isExecutor() ? executorStatuses() : Object.keys(STATUS))
    .map((k) => `<option value="${k}" ${t.studioStatus === k ? "selected" : ""}>${STATUS[k].label}</option>`)
    .join("");
  $("drawer").innerHTML = `
    <button class="btn ghost" id="closeDrawer">Закрити</button>
    <h2>${escapeHtml(t.name)}</h2>
    <div class="meta">${t.line} · час ${t.shifts || 0} shift / ${t.hours || 0} h · ${person(t.assigneeId)?.name || "ще вільний"}</div>
    ${
      canOps()
        ? `<div class="field"><label>Назначити</label>
      <select id="stPerson">
        <option value="">— вільний</option>
        ${state.db.people
          .filter((p) => p.role === "executor")
          .map((p) => `<option value="${p.id}" ${t.assigneeId === p.id ? "selected" : ""}>${p.name}</option>`)
          .join("")}
      </select></div>`
        : `<div class="field"><label>Хто робить</label><div>${personCell(t.assigneeId)}</div></div>`
    }
    ${!t.assigneeId && isExecutor() ? `<button class="btn primary" id="claim">Взяти собі</button>` : ""}
    <div class="field"><label>Бриф</label><div class="brief">${escapeHtml(t.brief || "Ще немає тексту брифу")}</div>
      ${t.docUrl ? `<p><a href="${escapeHtml(t.docUrl)}" target="_blank" rel="noreferrer">Відкрити Google Doc</a></p>` : ""}
      ${t.folderUrl ? `<p><a href="${escapeHtml(t.folderUrl)}" target="_blank" rel="noreferrer">Тека на Drive</a></p>` : ""}
    </div>
    <div class="field"><label>${isExecutor() ? "Сюди вставити результат" : "Лінк на результат"}</label>
      <input id="stResult" value="${escapeHtml(t.resultUrl || "")}" placeholder="https://drive.google.com/..." ${canEdit ? "" : "disabled"} />
    </div>
    <div class="field"><label>Статус</label>
      <select id="stStatus" ${canEdit ? "" : "disabled"}>${statusOpts}</select>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn primary" id="saveTask">Зберегти</button>
      ${canOps() && t.resultUrl ? `<button class="btn green" id="exportOne">Віддати цей клієнту</button>` : ""}
    </div>
  `;
  $("drawerBg").classList.add("show");
  $("closeDrawer").onclick = () => $("drawerBg").classList.remove("show");
  $("claim")?.addEventListener("click", () =>
    updateTask(t.id, { assigneeId: me().id, studioStatus: "doing", note: `${me().name} взяв(ла) проект` })
  );
  $("saveTask").onclick = () => {
    const resultUrl = $("stResult").value.trim();
    const studioStatus = $("stStatus").value;
    const assigneeId = $("stPerson") ? $("stPerson").value : t.assigneeId;
    const note = resultUrl && resultUrl !== t.resultUrl ? `${me().name} вставив(ла) результат` : `${me().name} оновив(ла) статус`;
    updateTask(t.id, { resultUrl, studioStatus, assigneeId, note });
  };
  $("exportOne")?.addEventListener("click", async () => {
    const out = await api("/api/export-monday", { ids: [t.id] });
    applyState(out.state);
    toast("Цей проект віддано клієнту: check it please + Senior Approval");
    openTask(t.id);
  });
}

async function updateTask(id, patch) {
  const out = await api("/api/tasks/update", { id, ...patch });
  applyState(out.state);
  toast("Збережено");
  if (state.openId) openTask(id);
}
async function importMonday() {
  const out = await api("/api/import-monday", {});
  applyState(out.state);
  toast(out.added ? `З Monday ${out.added} нових` : "Нових немає");
}
async function provision() {
  const out = await api("/api/provision", { ids: [...state.selected] });
  applyState(out.state);
  toast("Теки в _PORTAL_TEST");
}
async function exportMonday() {
  const ids = [...state.selected];
  const ready = state.db.tasks.filter((t) => ids.includes(t.id) && t.resultUrl);
  if (!ready.length) {
    toast("Спочатку лінк на результат. Можна віддати 2 з 10, не чекаючи решту.");
    return;
  }
  const out = await api("/api/export-monday", { ids: ready.map((t) => t.id) });
  applyState(out.state);
  toast(`Віддано клієнту: ${out.exported.length}`);
}
async function resetDemo() {
  const out = await api("/api/reset", {});
  applyState(out);
  toast("Демо скинуто");
}
function applyState(db) {
  state.db = db;
  state.selected = new Set([...state.selected].filter((id) => db.tasks.some((t) => t.id === id)));
  render();
}

function render() {
  if (!state.db) return;
  renderWho();
  renderChrome();
  renderToolbar();
  renderKpis();
  renderBoard();
}

$("who").addEventListener("change", (e) => {
  state.roleId = e.target.value;
  state.selected.clear();
  state.view = "board";
  render();
});
$("navClose").addEventListener("click", () => {
  if (!isFinance()) return;
  state.view = "close";
  render();
});
$("emailCancel").onclick = () => $("emailModal").classList.remove("show");
$("emailApply").onclick = async () => {
  const out = await api("/api/parse-email", { text: $("emailText").value });
  applyState(out.state);
  $("emailModal").classList.remove("show");
  toast(`Лист: ${out.added} нових, ${out.updated} з оновленим shift`);
};
$("drawerBg").addEventListener("click", (e) => {
  if (e.target === $("drawerBg")) $("drawerBg").classList.remove("show");
});

api("/api/state").then((db) => {
  state.db = db;
  render();
});
