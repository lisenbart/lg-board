const STATUS = {
  imported: { label: "З Monday", cls: "status-imported" },
  todo: { label: "До роботи", cls: "status-todo" },
  doing: { label: "В роботі", cls: "status-doing" },
  done: { label: "Здано", cls: "status-done" },
  sent: { label: "Senior Approval", cls: "status-sent" },
  fix: { label: "Правки", cls: "status-fix" },
};

const GROUPS = [
  { id: "new", title: "Нові / з Monday", color: "#c4c4c4", statuses: ["imported"] },
  { id: "ready", title: "Ready to Start", color: "#fdab3d", statuses: ["todo"] },
  { id: "wip", title: "WIP", color: "#579bfc", statuses: ["doing"] },
  { id: "done", title: "Здано — можна на апрув", color: "#00c875", statuses: ["done"] },
  { id: "sent", title: "На Senior Approval у клієнта", color: "#66ccff", statuses: ["sent"] },
  { id: "fix", title: "Need Fixing", color: "#e2445c", statuses: ["fix"] },
];

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
    if (q && !t.name.toLowerCase().includes(q)) return false;
    if (mine && t.assigneeId !== state.roleId) return false;
    return true;
  });
}

function renderWho() {
  $("who").innerHTML = state.db.people
    .map(
      (p) =>
        `<option value="${p.id}" ${p.id === state.roleId ? "selected" : ""}>${escapeHtml(p.name)} · ${
          p.role === "studio" ? "студія" : "виконавець"
        }</option>`
    )
    .join("");
}

function renderToolbar() {
  const studio = me().role === "studio";
  const n = state.selected.size;
  $("toolbar").innerHTML = `
    ${studio ? `<button class="btn primary" id="btnImport">Завантажити з Monday</button>` : ""}
    ${studio ? `<button class="btn orange" id="btnEmail">Вставити лист зі shift</button>` : ""}
    ${studio ? `<button class="btn" id="btnFolders" ${n ? "" : "disabled"}>Створити теки (${n})</button>` : ""}
    ${studio ? `<button class="btn green" id="btnExport" ${n ? "" : "disabled"}>Вивантажити в Monday (${n})</button>` : ""}
    <input class="search" placeholder="Пошук за назвою таску" />
    ${studio ? `<button class="btn ghost" id="btnReset">Скинути демо</button>` : ""}
  `;
  $("toolbar").querySelector(".search")?.addEventListener("input", render);
  $("btnImport")?.addEventListener("click", importMonday);
  $("btnEmail")?.addEventListener("click", () => $("emailModal").classList.add("show"));
  $("btnFolders")?.addEventListener("click", provision);
  $("btnExport")?.addEventListener("click", exportMonday);
  $("btnReset")?.addEventListener("click", resetDemo);
}

function renderKpis() {
  const tasks = state.db.tasks;
  const hours = tasks.reduce((s, t) => s + (Number(t.hours) || 0), 0);
  const dd = tasks.filter((t) => t.line === "DD").reduce((s, t) => s + (Number(t.hours) || 0), 0);
  const dx = tasks.filter((t) => t.line === "DX").reduce((s, t) => s + (Number(t.hours) || 0), 0);
  const ready = tasks.filter((t) => t.studioStatus === "done").length;
  $("kpis").innerHTML = `
    <div class="kpi"><b>${tasks.length}</b><span>тасків у столі</span></div>
    <div class="kpi"><b>${hours.toFixed(1)} h</b><span>годин у таблиці</span></div>
    <div class="kpi"><b>${dd.toFixed(1)} / ${dx.toFixed(1)}</b><span>DD / DX години</span></div>
    <div class="kpi"><b>${ready}</b><span>готові на апрув зараз</span></div>
    <div class="kpi"><b>$${(hours * 35).toFixed(0)}</b><span>чорновик інвойсу × $35</span></div>
  `;
}

function initials(name) {
  return (name || "?").slice(0, 1);
}

function personCell(id) {
  const p = person(id);
  if (!p) return `<span class="empty">—</span>`;
  return `<span class="person"><span class="avatar" style="background:${p.color}">${initials(p.name)}</span>${escapeHtml(p.name)}</span>`;
}

function renderBoard() {
  if (state.view === "close") {
    renderClose();
    return;
  }
  const tasks = visibleTasks();
  const html = GROUPS.map((g) => {
    const rows = tasks.filter((t) => g.statuses.includes(t.studioStatus));
    return `
      <section class="group">
        <div class="group-head">
          <span class="gdot" style="background:${g.color}"></span>
          <h3 style="color:${g.color}">${g.title}</h3>
          <span class="count">${rows.length}</span>
        </div>
        <div class="cols hide-sm">
          <div></div><div>Task</div><div>Лінія</div><div>Shift</div><div>Hours</div>
          <div>Виконавець</div><div>Статус студії</div><div>Monday</div><div>Бриф</div><div>Результат</div>
        </div>
        ${
          rows.length
            ? rows.map(rowHtml).join("")
            : `<div class="cell empty" style="padding:12px 16px">Порожньо</div>`
        }
      </section>`;
  }).join("");
  $("board").innerHTML = html;
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

function rowHtml(t) {
  const st = STATUS[t.studioStatus] || STATUS.todo;
  const checked = state.selected.has(t.id) ? "checked" : "";
  return `
    <div class="row ${checked ? "selected" : ""}" data-id="${t.id}">
      <div class="cell"><input class="chk" data-id="${t.id}" type="checkbox" ${checked} /></div>
      <div class="cell name" title="${escapeHtml(t.name)}">${escapeHtml(t.name)}</div>
      <div class="cell"><span class="pill line-${t.line}">${t.line}</span></div>
      <div class="cell">${t.shifts || "—"}</div>
      <div class="cell">${t.hours || "—"}</div>
      <div class="cell">${personCell(t.assigneeId)}</div>
      <div class="cell"><span class="pill ${st.cls}">${st.label}</span></div>
      <div class="cell hide-sm"><span class="pill status-doing">${escapeHtml(t.mondayStatus || "—")}</span></div>
      <div class="cell hide-sm">${t.docUrl ? `<a class="linkish" href="${escapeHtml(t.docUrl)}" target="_blank" rel="noreferrer">Doc</a>` : `<span class="empty">N/A</span>`}</div>
      <div class="cell hide-sm">${t.resultUrl ? `<a class="linkish" href="${escapeHtml(t.resultUrl)}" target="_blank" rel="noreferrer">Link</a>` : `<span class="empty">—</span>`}</div>
    </div>`;
}

function renderClose() {
  const byLine = { DD: 0, DX: 0, DS: 0 };
  for (const t of state.db.tasks) byLine[t.line] = (byLine[t.line] || 0) + (Number(t.hours) || 0);
  const people = {};
  for (const t of state.db.tasks) {
    if (!t.assigneeId) continue;
    people[t.assigneeId] = (people[t.assigneeId] || 0) + (Number(t.hours) || 0);
  }
  $("board").innerHTML = `
    <section class="group" style="padding:18px">
      <h2 style="margin:0 0 8px">Чорновик закриття жовтня</h2>
      <p style="color:#676879">Це моніторинг з дошки, не бойові інвойси. Кнопка генерації PDF — наступний шар.</p>
      <div class="kpis" style="padding:0 0 16px">
        <div class="kpi"><b>${byLine.DD.toFixed(1)} h</b><span>DD × $35 = $${(byLine.DD * 35).toFixed(0)}</span></div>
        <div class="kpi"><b>${byLine.DX.toFixed(1)} h</b><span>DX × $35 = $${(byLine.DX * 35).toFixed(0)}</span></div>
        <div class="kpi"><b>${byLine.DS.toFixed(1)} h</b><span>DS (якщо з’явиться)</span></div>
      </div>
      <h3>Години людей (для calc після 15-го)</h3>
      ${Object.entries(people)
        .map(([id, h]) => {
          const p = person(id);
          return `<div style="padding:8px 0;border-bottom:1px solid #f0f1f5">${personCell(id)} — <b>${h.toFixed(1)} h</b> · $${(h * 15).toFixed(0)} @ $15</div>`;
        })
        .join("")}
      <p style="font-size:12px;color:#676879">Клієнту йде окремий файл SP-LG_projects (без імен) + інвойси DD/DX. Тут лише щоб ви бачили, що цифри зійдуться.</p>
    </section>`;
}

function openTask(id) {
  const t = state.db.tasks.find((x) => x.id === id);
  if (!t) return;
  state.openId = id;
  const studio = me().role === "studio";
  const mine = t.assigneeId === me().id;
  const canEdit = studio || mine || !t.assigneeId;
  $("drawer").innerHTML = `
    <button class="btn ghost" id="closeDrawer">Закрити</button>
    <h2>${escapeHtml(t.name)}</h2>
    <div class="meta">${t.line} · ${t.department} · ${t.game} · ${t.shifts || 0} shift · ${t.hours || 0} h</div>
    <div class="field"><label>Статус у студії</label>
      <select id="stStatus" ${canEdit ? "" : "disabled"}>
        ${Object.entries(STATUS)
          .map(([k, v]) => `<option value="${k}" ${t.studioStatus === k ? "selected" : ""}>${v.label}</option>`)
          .join("")}
      </select>
    </div>
    <div class="field"><label>Виконавець</label>
      <select id="stPerson" ${studio ? "" : "disabled"}>
        <option value="">— не призначено</option>
        ${state.db.people
          .filter((p) => p.role === "executor")
          .map((p) => `<option value="${p.id}" ${t.assigneeId === p.id ? "selected" : ""}>${p.name}</option>`)
          .join("")}
      </select>
    </div>
    ${!t.assigneeId && me().role === "executor" ? `<button class="btn primary" id="claim">Взяти собі</button>` : ""}
    <div class="field"><label>Бриф з Monday</label><div class="brief">${escapeHtml(t.brief || "Ще немає тексту брифу")}</div>
      ${t.docUrl ? `<p><a href="${escapeHtml(t.docUrl)}" target="_blank" rel="noreferrer">Відкрити Google Doc</a></p>` : ""}
      ${t.folderUrl ? `<p><a href="${escapeHtml(t.folderUrl)}" target="_blank" rel="noreferrer">Тека на Drive</a></p>` : `<p class="empty">Теки ще немає — студія натисне «Створити теки»</p>`}
    </div>
    <div class="field"><label>Лінк на результат</label>
      <input id="stResult" value="${escapeHtml(t.resultUrl || "")}" placeholder="https://drive.google.com/..." ${canEdit ? "" : "disabled"} />
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn primary" id="saveTask">Зберегти</button>
      ${studio && t.resultUrl ? `<button class="btn green" id="exportOne">Вивантажити цей у Monday</button>` : ""}
    </div>
    <h3 style="margin-top:22px;font-size:14px">Історія — щоб ви лишались у контексті</h3>
    <ul class="activity">${(t.activity || [])
      .slice()
      .reverse()
      .map((a) => `<li>${escapeHtml(a.at.slice(0, 16).replace("T", " "))} — ${escapeHtml(a.text)}</li>`)
      .join("")}</ul>
  `;
  $("drawerBg").classList.add("show");
  $("closeDrawer").onclick = () => $("drawerBg").classList.remove("show");
  $("claim")?.addEventListener("click", () =>
    updateTask(t.id, { assigneeId: me().id, studioStatus: "doing", note: `${me().name} взяв(ла) таск` })
  );
  $("saveTask").onclick = () => {
    const resultUrl = $("stResult").value.trim();
    const studioStatus = $("stStatus").value;
    const assigneeId = $("stPerson") ? $("stPerson").value : t.assigneeId;
    const note = resultUrl && resultUrl !== t.resultUrl ? `${me().name} додав(ла) лінк на результат` : `${me().name} оновив(ла) статус`;
    updateTask(t.id, { resultUrl, studioStatus, assigneeId, note });
  };
  $("exportOne")?.addEventListener("click", async () => {
    const out = await api("/api/export-monday", { ids: [t.id] });
    applyState(out.state);
    toast("Цей таск пішов у Monday як Senior Approval + check it please");
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
  toast(out.added ? `З Monday підтягнуто ${out.added} нових` : "Нових у Monday немає, статуси звірені");
}

async function provision() {
  const out = await api("/api/provision", { ids: [...state.selected] });
  applyState(out.state);
  toast("Теки позначені в _PORTAL_TEST, не в бойовому October");
}

async function exportMonday() {
  const ids = [...state.selected];
  const ready = state.db.tasks.filter((t) => ids.includes(t.id) && t.resultUrl);
  if (!ready.length) {
    toast("Потрібен лінк на результат. Можна здавати по 2 з 10, не чекаючи решту.");
    return;
  }
  const out = await api("/api/export-monday", { ids: ready.map((t) => t.id) });
  applyState(out.state);
  toast(`Вивантажено ${out.exported.length}: check it please + Senior Approval`);
}

async function resetDemo() {
  const out = await api("/api/reset", {});
  applyState(out);
  toast("Демо повернуто до жовтневої пачки");
}

function applyState(db) {
  state.db = db;
  state.selected = new Set([...state.selected].filter((id) => db.tasks.some((t) => t.id === id)));
  render();
}

function render() {
  if (!state.db) return;
  document.querySelectorAll(".view-tab").forEach((el) => {
    el.classList.toggle("active", el.dataset.view === state.view);
  });
  renderWho();
  renderToolbar();
  renderKpis();
  renderBoard();
}

$("who").addEventListener("change", (e) => {
  state.roleId = e.target.value;
  state.selected.clear();
  render();
});
document.querySelectorAll(".view-tab").forEach((el) => {
  el.addEventListener("click", () => {
    state.view = el.dataset.view;
    render();
  });
});
$("navClose").addEventListener("click", () => {
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
