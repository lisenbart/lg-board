/** In-portal notices. Keep KINDS in sync with notice_io.py. */
(function (root) {
  const KINDS = {
    "task.landed": {
      label: "New project",
      title: "{name}",
      detail: "Ready to start · needs a person",
      mark: "new",
      audience: { roles: ["teamlead", "manager"] },
      skipActor: true,
      channels: ["portal"],
    },
    "task.assigned": {
      label: "On you",
      title: "{name}",
      detail: "Assigned to you",
      mark: "mine",
      audience: { assignee: true },
      skipActor: true,
      channels: ["portal"],
    },
    "task.revision": {
      label: "Need fixing",
      title: "{name}",
      detail: "Need Fixing",
      mark: "fix",
      audience: { assignee: true },
      skipActor: true,
      channels: ["portal"],
    },
    "task.comment": {
      label: "Client notes",
      title: "{name}",
      detail: "New note under the brief",
      mark: "note",
      audience: { assignee: true },
      skipActor: true,
      channels: ["portal"],
    },
    "task.ready": {
      label: "Ready to send",
      title: "{name}",
      detail: "Done · result link in",
      mark: "send",
      audience: { roles: ["manager"] },
      skipActor: true,
      channels: ["portal"],
    },
    "task.sent": {
      label: "Sent to client",
      title: "{name}",
      detail: "Senior Approval",
      mark: "",
      audience: { assignee: true, roles: ["teamlead"] },
      skipActor: true,
      channels: ["portal"],
    },
    "task.closed": {
      label: "Closed",
      title: "{name}",
      detail: "Client accepted · Closed",
      mark: "",
      audience: { assignee: true, roles: ["teamlead"] },
      skipActor: true,
      channels: ["portal"],
    },
  };
  const KEEP = 400;
  const MARK_LABEL = { new: "New", mine: "On you", fix: "Fix", note: "Notes", send: "Send" };

  const now = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const fill = (tpl, payload) =>
    String(tpl || "").replace(/\{(\w+)\}/g, (_, k) => String((payload || {})[k] ?? ""));
  const personName = (db, id) => (db.people || []).find((p) => p.id === id)?.name || "";

  function ensure(db) {
    if (!db.notices) {
      db.notices = [];
      db.noticeReads = db.noticeReads || {};
      bootstrap(db);
    }
    db.notices = db.notices || [];
    db.noticeReads = db.noticeReads || {};
    db.meta = db.meta || {};
    return db;
  }

  function resolveAudience(db, spec, task, actorId) {
    const rule = (spec && spec.audience) || {};
    const ids = [];
    const seen = new Set();
    const add = (pid) => {
      const id = String(pid || "").trim();
      if (!id || seen.has(id)) return;
      seen.add(id);
      ids.push(id);
    };
    const roles = new Set(rule.roles || []);
    if (roles.size) {
      for (const p of db.people || []) if (roles.has(p.role)) add(p.id);
    }
    if (rule.assignee && task) add(task.assigneeId);
    for (const pid of rule.person_ids || []) add(pid);
    return spec.skipActor ? ids.filter((id) => id !== actorId) : ids;
  }

  function emit(db, kind, opts = {}) {
    const spec = KINDS[kind];
    if (!spec) return null;
    ensure(db);
    const task = opts.task || {};
    const payload = { ...(opts.payload || {}) };
    if (payload.name == null) payload.name = task.name || "";
    if (payload.line == null) payload.line = task.line || "";
    if (payload.actorName == null) payload.actorName = personName(db, opts.actorId);
    const audience = resolveAudience(db, spec, task, opts.actorId || "");
    if (!audience.length) return null;
    db.meta.noticeSeq = (Number(db.meta.noticeSeq) || 0) + 1;
    const notice = {
      id: `n-${db.meta.noticeSeq}`,
      at: opts.at || now(),
      kind,
      actorId: opts.actorId || "",
      taskId: task.id || "",
      audience,
      payload,
      channels: spec.channels ? spec.channels.slice() : ["portal"],
    };
    db.notices.unshift(notice);
    db.notices = db.notices.slice(0, KEEP);
    return notice;
  }

  function forPerson(db, personId, unreadOnly) {
    if (!personId) return [];
    const reads = (db.noticeReads || {})[personId] || {};
    return (db.notices || []).filter((n) => {
      if (!(n.audience || []).includes(personId)) return false;
      if (unreadOnly && reads[n.id]) return false;
      return true;
    });
  }

  function rowMark(db, personId, taskId) {
    for (const n of forPerson(db, personId, true)) {
      if (n.taskId !== taskId) continue;
      const mark = (KINDS[n.kind] || {}).mark;
      if (mark) return mark;
    }
    return "";
  }

  function ack(db, personId, opts = {}) {
    if (!personId) return 0;
    ensure(db);
    const allMine = Boolean(opts.allMine);
    const ids = opts.ids;
    const taskId = opts.taskId;
    const kinds = opts.kinds;
    if (!allMine && !ids && !taskId) return 0;
    const wanted = ids ? new Set(ids) : null;
    const kindSet = kinds ? new Set(kinds) : null;
    const reads = (db.noticeReads[personId] = db.noticeReads[personId] || {});
    const stamp = now();
    let n = 0;
    for (const notice of db.notices || []) {
      if (!(notice.audience || []).includes(personId) || reads[notice.id]) continue;
      if (wanted && !wanted.has(notice.id)) continue;
      if (taskId && notice.taskId !== taskId) continue;
      if (kindSet && !kindSet.has(notice.kind)) continue;
      reads[notice.id] = stamp;
      n += 1;
    }
    return n;
  }

  function onLanded(db, task, actorId, at) {
    return emit(db, "task.landed", { actorId, task, at });
  }

  function onTaskChange(db, task, before, actorId) {
    const prev = before || {};
    const oldA = prev.assigneeId || "";
    const newA = task.assigneeId || "";
    const oldS = prev.studioStatus;
    const newS = task.studioStatus;
    if (newA && newA !== oldA) {
      emit(db, "task.assigned", { actorId, task, payload: { from: oldA, to: newA } });
      ack(db, actorId, { taskId: task.id, kinds: ["task.landed"] });
    }
    if (newS && newS !== oldS) {
      if (newS === "revision") emit(db, "task.revision", { actorId, task });
      if (newS === "done") {
        emit(db, "task.ready", { actorId, task });
        ack(db, actorId, { taskId: task.id, kinds: ["task.revision", "task.assigned"] });
      }
      if (newS === "approve") {
        emit(db, "task.sent", { actorId, task });
        ack(db, actorId, { taskId: task.id, kinds: ["task.ready"] });
      }
      if (newS === "closed") {
        emit(db, "task.closed", { actorId, task });
        ack(db, actorId, { taskId: task.id, kinds: ["task.sent", "task.ready"] });
      }
    }
  }

  function bootstrap(db) {
    let n = 0;
    for (const task of db.tasks || []) {
      const activity = task.activity || [];
      const at = activity.length ? activity[activity.length - 1].at : undefined;
      if (task.studioStatus === "new" && !task.assigneeId) {
        if (onLanded(db, task, "", at)) n += 1;
      } else if (task.studioStatus === "done" && String(task.resultUrl || "").trim()) {
        if (emit(db, "task.ready", { task, at })) n += 1;
      } else if (task.studioStatus === "revision" && task.assigneeId) {
        if (emit(db, "task.revision", { task, at })) n += 1;
      }
    }
    return n;
  }

  function titleOf(notice) {
    const spec = KINDS[notice.kind] || {};
    return fill(spec.title, notice.payload) || spec.label || notice.kind;
  }
  function detailOf(notice) {
    const spec = KINDS[notice.kind] || {};
    const extra = notice.payload?.actorName ? `${notice.payload.actorName} · ` : "";
    return extra + fill(spec.detail, notice.payload);
  }
  function labelOf(kind) {
    return (KINDS[kind] || {}).label || kind;
  }

  root.LGNotices = {
    KINDS,
    MARK_LABEL,
    ensure,
    emit,
    forPerson,
    rowMark,
    ack,
    onLanded,
    onTaskChange,
    bootstrap,
    titleOf,
    detailOf,
    labelOf,
    fill,
  };
})(window);
