/* 대시보드 화면 — 판정·계산은 customs.js 가 한다. 여기서는 파일을 읽고, 고른 열을 기억하고, 그린다. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var C = window.Customs, FR = window.FileRules;
  // (v1.10.0) files = 올린 파일 목록(이름 · 종류 · 기간 · 행 수) — 원본 행과 따로, 늘 저장한다(작다)
  var LS = { data: 'b2611-07.dash', unit: 'b2611-07.dash.unit', kinds: 'b2611-07.dash.kinds', settings: 'b2611-07.dash.settings', files: 'b2611-07.dash.files' };
  // (v1.7.0) 수출 설정(Plant → 본부 표 · GN 제외) — 이 브라우저에만 둔다. 값 정리는 customs.js(exportSettings).
  function loadSettings() { try { return C.exportSettings(JSON.parse(localStorage.getItem(LS.settings) || 'null')); } catch (e) { return C.exportSettings(null); } }
  function saveSettings(raw) { state.settings = C.exportSettings(raw); try { localStorage.setItem(LS.settings, JSON.stringify(raw)); } catch (e) { /* 기억 못 해도 이번 화면에는 반영 */ } }
  // 사람이 고른 종류 — { '머리글|머리글…': kind }. 같은 모양의 파일을 다음에 올리면 이 종류로 넣는다.
  function kindPrefs() { try { return JSON.parse(localStorage.getItem(LS.kinds) || '{}') || {}; } catch (e) { return {}; } }
  function setKindPref(headers, kind) { try { var p = kindPrefs(); p[headers.join('|')] = kind; localStorage.setItem(LS.kinds, JSON.stringify(p)); } catch (e) { /* 기억 못 해도 이번 화면에는 반영된다 */ } }
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  // (v1.5.0) sets[kind] = { files: [{ name, file, uploadedAt, headers, aoa(머리글 포함), offset, override, reason }], m: 합친 결과(build 가 붙임) }
  // 같은 종류 파일은 모두 더한다. 이름이 같은 파일은 그 파일만 바꾼다. 합치는 규칙은 customs.js(upsertFile · mergeFiles).
  var state = { sets: {}, pending: [], filter: {}, range: null, tab: 'trade', unit: localStorage.getItem(LS.unit) || '원', open: {}, settings: null };
  state.settings = loadSettings();
  // (v1.10.0) 조회 모드: view = true 이면 sets 는 조회용 파일만(저장 안 함), saved 는 가려 둔 확정 데이터. held = FTA 파일(다음 단계 — 합계에 안 넣음)
  state.view = false; state.saved = null; state.held = []; state.lostFiles = [];
  state.base = function () { return state.view ? (state.saved || {}) : state.sets; };
  function openKey(k, f) { return k + '|' + C.fileKey(f); }
  function label(k) { return C.DATASETS[k].label; }

  function now() { var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); }
  function msg(html, cls) { $('d-msg').innerHTML = html ? '<div class="' + (cls || 'note') + '">' + html + '</div>' : ''; }

  // 파일 하나를 그 종류에 넣는다 → 안내 문구
  function putFile(k, item) {
    var s = state.sets[k] || (state.sets[k] = { files: [] });
    var r = C.upsertFile(s.files, item);
    s.files = r.files;
    var why = item.reason ? ' · 근거: ' + esc(item.reason) : '';
    return r.action === 'replaced'
      ? esc(item.file) + ' 파일을 새 것으로 바꿨습니다 — ' + esc(label(k)) + why
      : esc(item.file) + ' 파일을 더했습니다(이 종류 파일 ' + s.files.length + '개) — ' + esc(label(k)) + why;
  }
  // 이번에 넣은 파일이 낀 기간 겹침 → 경고 문구
  function overlapNotes(k, names) {
    var s = state.sets[k]; if (!s || !s.m) return [];
    return s.m.overlaps.filter(function (o) { return names[o.a] || names[o.b]; }).map(function (o) {
      return '<b>기간이 겹칩니다. 중복 집계일 수 있습니다</b> — ' + esc(label(k)) + ': ' + esc(o.a) + ' · ' + esc(o.b) + ' (' + C.monthLabel(o.from) + ' ~ ' + C.monthLabel(o.to) + ')';
    });
  }
  // 올린 파일 하나를 다른 종류로 옮긴다. 열 짝짓기는 새 종류 기준으로 처음부터 다시 한다.
  function changeKind(from, i, to) {
    var s = state.sets[from], f = s && s.files[i];
    if (!f || !C.DATASETS[to] || from === to) return false;
    var same = state.sets[to] && state.sets[to].files.filter(function (x) { return C.fileKey(x) === C.fileKey(f); })[0];
    if (same && !window.confirm('「' + label(to) + '」에 이름이 같은 파일 ' + same.file + ' 이(가) 있습니다. 이 파일로 바꿀까요?')) return false;
    s.files.splice(i, 1); if (!s.files.length) delete state.sets[from];
    f.override = {}; f.reason = '직접 고름';
    var text = putFile(to, f), names = {}; names[f.file] = 1;
    state.open[openKey(to, f)] = true;
    setKindPref(f.headers, to);
    var note = rebuild(true), ov = overlapNotes(to, names);
    msg(esc(f.file) + ' → ' + esc(label(to)) + '(으)로 옮겼습니다. ' + text + '. 같은 모양의 파일은 다음에도 이 종류로 넣습니다.' + (ov.length ? '<br>' + ov.join('<br>') : '') + note, ov.length || note ? 'warn' : 'ok');
    return true;
  }
  function dropFile(k, i) {
    var s = state.sets[k], f = s && s.files[i]; if (!f) return;
    s.files.splice(i, 1); if (!s.files.length) delete state.sets[k];
    delete state.open[openKey(k, f)];
    var note = rebuild(false);
    msg(esc(f.file) + ' 파일을 뺐습니다 — ' + esc(label(k)) + (state.sets[k] ? '(이 종류 파일 ' + state.sets[k].files.length + '개)' : '(이 종류 파일 없음)') + note, note ? 'warn' : 'ok');
  }

  /* ---------- 읽기 ---------- */
  function sheetsOf(wb) {
    return wb.SheetNames.map(function (n) {
      var aoa = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' });
      var hr = C.findHeaderRow(aoa);
      return { name: n, aoa: aoa.slice(hr), offset: hr };
    }).filter(function (s) { return s.aoa.length > 1; });
  }
  // 파일 묶음 → 종류별로 넣는다. 따로 올리든 함께 올리든 같은 종류는 모두 더한다(머리글이 달라도). 이름이 같은 파일은 그 파일만 바꾼다.
  // (v1.10.0) 파일 하나의 월 목록 — 파일 이름 기간이 있으면 그것, 없으면 지난번 계산한 데이터 기간
  function monthsOfFile(k, f) {
    if (f.meta && f.meta.period) return f.meta.period.months;
    var s = state.base()[k], i = s ? s.files.indexOf(f) : -1, p = i >= 0 && s.m && s.m.files[i] ? s.m.files[i].period : null;
    return p ? FR.monthsBetween(p.from, p.to) : [];
  }
  function rowsOfItem(item) { return (item.parts || [{ aoa: item.aoa }]).reduce(function (t, pt) { return t + Math.max(0, (pt.aoa || []).length - 1); }, 0); }
  function rowsOfOld(k, f) { var s = state.base()[k], i = s.files.indexOf(f), p = s.m && s.m.files[i]; return p && p.norm ? p.norm.records.length : rowsOfItem(f); }
  // (v1.10.0) 확정본: 같은 종류 · 겹치는 기간(또는 같은 이름) 파일이 있으면 「교체할까요?」 — 조용히 둘 다 더하지 않는다.
  //   → true(넣음) / false(사용자가 취소 — 새 파일을 올리지 않음)
  function placeConfirmed(k, item, sets) {
    var s = sets[k], months = item.meta && item.meta.period ? item.meta.period.months : null;
    var clash = !s ? [] : s.files.filter(function (f) {
      if (C.fileKey(f) === C.fileKey(item)) return true;
      if (!months) return false;
      var om = monthsOfFile(k, f); return om.some(function (m) { return months.indexOf(m) >= 0; });
    });
    if (clash.length) {
      var lines = clash.map(function (f) { return '  · ' + f.file + ' — 올린 시각 ' + (f.uploadedAt || '?') + ' · ' + C.fmtNum(rowsOfOld(k, f)) + '행' + (f.meta && f.meta.period ? ' · ' + f.meta.period.text : ''); });
      var ok = window.confirm('「' + item.file + '」(' + C.fmtNum(rowsOfItem(item)) + '행)과 기간이 겹치는 ' + label(k) + ' 파일이 있습니다.\n\n이전 파일:\n' + lines.join('\n') +
        '\n\n이전 파일을 교체할까요?\n[확인] 이전 파일을 빼고 새 파일로 교체  ·  [취소] 새 파일을 올리지 않음\n\n같은 월인데 행 수가 다르면 늦게 계상된 신고가 있다는 뜻입니다.');
      if (!ok) return false;
      s.files = s.files.filter(function (f) { return clash.indexOf(f) < 0; });
      item.replaced = clash.map(function (f) { return { file: f.file, uploadedAt: f.uploadedAt, rows: rowsOfOld(k, f) }; });
    }
    var t = sets[k] || (sets[k] = { files: [] }); t.files.push(item);
    return true;
  }
  function addFiles(list) {
    var notes = [], warn = false, names = {}, views = [], confirmedN = 0;
    list.forEach(function (f) {
      var sheets = sheetsOf(f.wb);
      if (!sheets.length) { notes.push(esc(f.name) + ' — 읽을 표가 없습니다.'); warn = true; return; }
      // (v1.8.0) 같은 모양의 시트는 모두 읽어 합친다(RAW1~RAW10 등). 집계표 · 열이 다른 시트는 건너뛰고 이름을 남긴다 — 고르는 규칙은 C.pickSheets
      var pk = C.pickSheets(sheets, f.name), use = pk.use, best = { s: use[0], d: pk.detect };
      var item = { name: f.name, file: f.name + (use.length === 1 && sheets.length > 1 ? ' · ' + best.s.name : ''), uploadedAt: now(), headers: C.uniqueHeaders(best.s.aoa[0]), aoa: best.s.aoa, offset: best.s.offset, override: {} };
      if (use.length > 1) item.parts = use.map(function (s) { return { sheet: s.name, aoa: s.aoa, offset: s.offset }; });
      if (pk.skipped.length) item.skippedSheets = pk.skipped;
      // (v1.10.0) 파일 이름으로 종류 · 기간 · 확정본/조회용 · 월 귀속을 먼저 정한다(규칙은 filerules.js). 이름으로 못 정하면 내용 판별.
      var info = FR.describe(f.name, best.d);
      if (info.group === 'errscore' && info.part) { notes.push(esc(f.name) + ' — 유니패스 오류점수 ' + esc(info.part) + '목록으로 인식했습니다. <a href="errors.html">오류점수 화면</a>에서 올려 주세요(대시보드 합계에는 넣지 않음).'); warn = true; return; }
      if (info.group === 'fta') { state.held.push({ file: f.name, label: info.label, rows: rowsOfItem(item), uploadedAt: item.uploadedAt, warnings: info.warnings }); notes.push(esc(f.name) + ' — ' + esc(info.label) + ' 파일로 인식했습니다. FTA 집계는 다음 단계라 목록에만 올리고 합계에는 넣지 않습니다(물자대가 두 번 잡히지 않게).'); warn = true; return; }
      // 사람이 전에 같은 머리글의 파일 종류를 바꿔 준 적이 있으면 — 파일 이름으로 정하지 못한 경우에만 그 종류가 앞선다
      var byName = info.dataset && info.how.indexOf('파일 이름') === 0, pref = kindPrefs()[item.headers.join('|')];
      var kind = byName ? info.dataset : pref && C.DATASETS[pref] ? pref : best.d.kind;
      var reason = byName ? info.how : pref && C.DATASETS[pref] ? '전에 직접 고른 종류' : best.d.reason;
      item.meta = info;
      if (!kind) { state.pending.push(item); notes.push(esc(f.name) + ' — 어떤 자료인지 알아보지 못했습니다. 아래에서 종류를 골라 주세요.'); warn = true; return; }
      info.dataset = kind; item.reason = reason;
      info.warnings.forEach(function (w) { notes.push(esc(f.name) + ' — <b>' + esc(w) + '</b>'); warn = true; });
      if (info.mode === 'view') { views.push({ kind: kind, item: item }); return; }
      if (!placeConfirmed(kind, item, state.base())) { notes.push(esc(item.file) + ' — 올리지 않았습니다(이전 파일 그대로).'); warn = true; return; }
      confirmedN++;
      notes.push(esc(item.file) + (item.replaced ? ' — 이전 파일(' + esc(item.replaced.map(function (r) { return r.file + ' · ' + r.uploadedAt + ' · ' + C.fmtNum(r.rows) + '행'; }).join(', ')) + ')을 교체했습니다' : ' 파일을 더했습니다') + ' — ' + esc(label(kind)) + ' · ' + esc(info.modeWhy));
      names[kind] = names[kind] || {}; names[kind][item.file] = 1;
    });
    // 확정본을 올리면 조회 모드를 끝낸다(확정 데이터 화면으로). 조회용이 함께 있으면 그것만 조회 모드로 다시 연다.
    if (confirmedN && state.view) endView(true);
    if (views.length) {
      if (!state.view) { state.saved = state.sets; state.sets = {}; state.view = true; }
      views.forEach(function (v) { putFile(v.kind, v.item); });
      notes.push('<b>조회 모드</b> — ' + esc(views.map(function (v) { return v.item.file; }).join(', ')) + ' 은(는) 저장하지 않고 화면에만 보입니다. 저장된 확정 데이터는 그대로입니다.');
    }
    var note = rebuild(true);
    Object.keys(names).forEach(function (k) { overlapNotes(k, names[k]).forEach(function (t) { notes.push(t); warn = true; }); });
    msg(notes.join('<br>') + note, warn || state.pending.length || note ? 'warn' : 'ok');
  }
  // (v1.10.0) 조회 모드 끝내기 — 저장된 확정 데이터 화면으로 돌아간다(조회 데이터는 버림)
  function endView(silent) {
    if (!state.view) return;
    state.sets = state.saved || {}; state.saved = null; state.view = false; state.open = {};
    if (!silent) { var note = rebuild(true); msg('조회 모드를 끝냈습니다. 저장된 확정 데이터를 보입니다.' + note, note ? 'warn' : 'ok'); }
  }
  // (v1.10.0) 「이 결과를 저장」 — 누를 때만 조회 데이터를 확정 데이터에 넣는다(겹치면 교체할지 묻는다)
  function keepView() {
    if (!state.view) return;
    var views = state.sets, base = state.saved || {}, done = [], skip = [];
    Object.keys(views).forEach(function (k) {
      views[k].files.forEach(function (f) {
        f.meta = f.meta || {}; f.meta.mode = 'confirmed'; f.meta.modeWhy = '조회 결과를 저장함(' + now() + ')'; f.meta.savedFromView = true;
        if (placeConfirmed(k, f, base)) done.push(f.file); else skip.push(f.file);
      });
    });
    state.sets = base; state.saved = null; state.view = false;
    var note = rebuild(true);
    msg((done.length ? esc(done.join(', ')) + ' — 조회 결과를 저장했습니다.' : '') + (skip.length ? ' ' + esc(skip.join(', ')) + ' — 저장하지 않았습니다(이전 파일 그대로).' : '') + note, skip.length || note ? 'warn' : 'ok');
  }
  function readFiles(files) {
    var list = [], left = files.length;
    if (!left) return;
    Array.prototype.forEach.call(files, function (f) {
      var rd = new FileReader();
      rd.onload = function (e) {
        try { list.push({ name: f.name, wb: XLSX.read(new Uint8Array(e.target.result), { type: 'array' }) }); }
        catch (err) { msg('파일을 읽지 못했습니다: ' + esc(f.name) + ' — ' + esc(err.message), 'warn'); }
        if (--left === 0) addFiles(list);
      };
      rd.readAsArrayBuffer(f);
    });
  }
  function loadSample() {
    state.sets = {}; state.pending = []; state.open = {}; state.view = false; state.saved = null; state.held = [];
    addFiles(C.sampleFiles().map(function (f) {
      var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(f.aoa), '데이터');
      return { name: f.name, wb: wb };
    }));
    msg('예제 엑셀 5종(가짜 데이터)을 올렸습니다. 예제 데이터는 실제 사내 데이터가 아닙니다.', 'ok');
  }

  /* ---------- 계산 묶기(엔진 호출) ---------- */
  function build(k) { var s = state.sets[k]; s.m = C.mergeFiles(k, s.files, state.settings); }
  function ready(k) { return state.sets[k] && state.sets[k].m && state.sets[k].m.ok ? state.sets[k] : null; }
  // 다시 계산하고 그린다. 기억하지 못했으면 그 알림 문구(HTML)를 돌려준다 — 부른 쪽이 안내 문구 뒤에 붙인다.
  function rebuild(resetRange) {
    Object.keys(state.sets).forEach(build);
    var period = C.unionPeriod(C.KINDS.map(function (k) { return ready(k) ? ready(k).m.period : null; }));
    state.period = period;
    if (period && (resetRange || !state.range || state.range.from < period.from || state.range.to > period.to)) state.range = C.defaultRange(period);
    if (!period) state.range = null;
    // (v1.6.0) 결정문 탭은 기간을 따로 — 기본 2026-01 ~ 자료 마지막 달(규칙은 customs.js)
    var rs = ready('ruling'), rper = rs ? C.rulingPeriod(rs.m.records) : null, rms = C.rulingMonths(rper);
    state.rperiod = rper;
    if (rper && (resetRange || !state.rrange || rms.indexOf(state.rrange.from) < 0 || rms.indexOf(state.rrange.to) < 0)) state.rrange = C.rulingDefaultRange(rper);
    if (!rper) state.rrange = null;
    var note = save();
    renderSets(); renderFilter(); renderTab();
    return note;
  }
  function save() {
    if (!$('d-remember').checked) return '';
    var keep = {};
    // (v1.10.0) 조회 모드의 파일은 절대 저장하지 않는다 — 가려 둔 확정 데이터(base)만
    var base = state.base(), list = [];
    Object.keys(base).forEach(function (k) {
      keep[k] = { files: base[k].files.map(function (f, i) {
        // (v1.8.0) 여러 시트면 parts 만 기억한다(aoa 는 첫 시트와 같아 비워 둔다 — 되읽을 때 채움)
        var o = { name: f.name, file: f.file, uploadedAt: f.uploadedAt, headers: f.headers, aoa: f.parts ? [] : f.aoa, offset: f.offset, override: f.override, reason: f.reason };
        if (f.parts) o.parts = f.parts;
        if (f.skippedSheets) o.skippedSheets = f.skippedSheets;
        if (f.meta) o.meta = f.meta;
        var p = base[k].m && base[k].m.files[i];
        list.push({ file: f.file, kind: k, uploadedAt: f.uploadedAt, rows: p && p.norm ? p.norm.records.length : null, period: f.meta && f.meta.period ? f.meta.period.text : p && p.period ? p.period.from + '~' + p.period.to : null, rule: f.meta ? f.meta.rule : null });
        return o;
      }) };
    });
    // 파일 목록(작다)은 원본 행과 따로 늘 저장 — 원본이 커서 못 남겨도 무엇을 올렸는지는 남는다
    try { localStorage.setItem(LS.files, JSON.stringify({ v: 1, files: list })); } catch (e0) { /* 목록도 못 남기면 그대로 */ }
    try { localStorage.setItem(LS.data, JSON.stringify({ v: 2, sets: keep })); return ''; }
    catch (e) {
      // 남겨 두면 다음에 열 때 지금과 다른 옛 자료가 보인다 → 지운다
      try { localStorage.removeItem(LS.data); } catch (e2) { /* 지우지 못해도 화면은 계속 */ }
      return '<br><b>데이터가 커서 이 브라우저에 원본 행을 기억하지 못했습니다.</b> 파일 목록(이름 · 종류 · 기간 · 행 수)만 남겼습니다. 다음에 열 때 다시 올려 주세요.';
    }
  }
  function restore() {
    try {
      var j = C.migrateSaved(JSON.parse(localStorage.getItem(LS.data) || 'null'));
      Object.keys(j.sets).forEach(function (k) { j.sets[k].files.forEach(function (f) { f.headers = C.uniqueHeaders(f.headers); }); state.sets[k] = j.sets[k]; });
    } catch (e) { state.sets = {}; }
    // (v1.10.0) 목록에는 있는데 원본 행이 없는 파일 = 용량 때문에 기억하지 못한 파일 → 다시 올려 달라고 알린다
    try {
      var fl = JSON.parse(localStorage.getItem(LS.files) || 'null'), have = {};
      Object.keys(state.sets).forEach(function (k) { state.sets[k].files.forEach(function (f) { have[k + '|' + f.file] = 1; }); });
      state.lostFiles = fl && Array.isArray(fl.files) ? fl.files.filter(function (x) { return x && x.file && !have[x.kind + '|' + x.file]; }) : [];
    } catch (e3) { state.lostFiles = []; }
    return Object.keys(state.sets).length > 0;
  }

  /* ---------- 올린 데이터 표 · 열 짝짓기 ---------- */
  var REASON = function (sc) { return sc === 'user' ? '직접 고름' : sc === 'user-none' ? '없음으로 고름' : sc === 1 ? '같은 이름' : sc >= 0.95 ? '같은 뜻 낱말' : sc ? '이름 일부 포함' : ''; };
  function example(f, h) { var c = f.headers.indexOf(h); for (var i = 1; c >= 0 && i < f.aoa.length && i <= 50; i++) { var v = f.aoa[i][c]; if (v != null && String(v).trim()) return String(v); } return ''; }
  function plabel(p) { return p ? C.monthLabel(p.from) + ' ~ ' + C.monthLabel(p.to) : '—'; }
  // (v1.10.0) 파일 하나의 판별 정보(종류 · 기간 · 확정본/조회용 · 월 귀속) · 경고 — 규칙은 filerules.js, 날짜 사정은 customs.js(fileDates)
  function fileInfo(k, f, p) {
    var mt = f.meta, d = p.dates || {}, w = [], info = [];
    if (!mt) return '';
    info.push('인식: ' + label(k) + ' (' + (mt.how || '내용') + ')');
    info.push('기간: ' + (mt.period ? mt.period.text + (mt.period.promoted ? '(한 달 전체)' : '') : p.period ? plabel(p.period) + ' (데이터)' : '—'));
    info.push(mt.mode === 'view' ? '조회용 — 저장 안 함' : '확정본');
    info.push('월 귀속: ' + mt.rule + ' ' + (mt.ruleText || ''));
    if (d.noDate) info.push('날짜 빈 행 ' + C.fmtNum(d.noDate) + '건은 ' + mt.forceMonth + '로 넣음');
    if (f.replaced) info.push('교체한 이전 파일: ' + f.replaced.map(function (r) { return r.file + '(' + r.uploadedAt + ' · ' + C.fmtNum(r.rows) + '행)'; }).join(', '));
    if (!mt.period && !p.period) w.push('기간을 판별하지 못함');
    if (!d.dateHeader) w.push('날짜 열을 찾지 못함' + (FR.DATE_COL[k] ? ' — 「' + FR.DATE_COL[k] + '」' : ''));
    if (d.dateBlank) w.push('월 미지정 행 ' + C.fmtNum(d.dateBlank) + '건 (날짜 빈칸 — 실적 합계에서 빠짐)');
    if (d.outside) w.push('파일명 기간을 벗어난 행 ' + C.fmtNum(d.outside) + '건' + (mt.forceMonth ? ' (파일 이름 월로 넣음)' : ''));
    (mt.warnings || []).forEach(function (x) { w.push(x); });
    return '<br><small class="sub" data-k="finfo">' + esc(info.join(' · ')) + '</small>' + w.map(function (x) { return ' <span class="tag bad-t" data-k="fwarn">' + esc(x) + '</span>'; }).join('');
  }
  // (v1.10.0) 조회 모드 띠 — 「조회 모드 · 기간 · 저장되지 않습니다」 + 보관 안내 + [이 결과를 저장] · [조회 모드 끝내기]
  function renderViewBar() {
    var bar = $('d-viewbar'), top = $('d-viewtop'); if (!bar) return;
    if (!state.view) { bar.hidden = true; bar.innerHTML = ''; if (top) { top.hidden = true; top.innerHTML = ''; } return; }
    var lines = [], first = null;
    Object.keys(state.sets).forEach(function (k) {
      var s = state.sets[k]; s.files.forEach(function (f, i) {
        var p = s.m && s.m.files[i], d = p && p.dates || {}; first = first || f.meta;
        lines.push(FR.viewBanner(f.meta || {}, { from: d.from, to: d.to, rows: d.rows }) + ' — ' + f.file);
      });
    });
    bar.hidden = false;
    bar.innerHTML = '<div class="warn viewbar" data-k="viewbar"><b>' + esc(lines.join(' / ')) + '</b>' +
      '<p class="sub">' + esc(FR.keepHint(first)) + ' · ' + esc(FR.BASIS_TEXT) + '</p>' +
      '<p class="sub">같은 EXPORT 파일을 여러 번 받으면 Windows 가 「EXPORT-수입 (1).XLSX」처럼 괄호를 붙입니다. 보관할 파일은 표준 파일명(2026-10_수입실적.xlsx)으로 바꿔 올려 주세요.</p>' +
      '<div class="btnrow"><button class="btn primary" type="button" data-view-keep>이 결과를 저장</button><button class="btn" type="button" data-view-end>조회 모드 끝내기</button></div></div>';
    if (top) { top.hidden = false; top.innerHTML = '<div class="warn viewbar" data-k="viewtop"><b>' + esc(lines.join(' / ')) + '</b> <button class="x" type="button" data-view-keep>이 결과를 저장</button> <button class="x" type="button" data-view-end>조회 모드 끝내기</button></div>'; }
  }
  function renderSets() {
    var ks = C.KINDS.filter(function (k) { return state.sets[k]; });
    var h = '';
    renderViewBar();
    // (v1.10.0) 용량 때문에 원본 행을 기억하지 못한 파일 · FTA(다음 단계) 파일
    var lost = state.lostFiles.filter(function (x) { return !(state.base()[x.kind] && state.base()[x.kind].files.some(function (f) { return f.file === x.file; })); });
    if (lost.length) h += '<div class="warn" data-k="lost"><b>지난번 올린 파일 중 원본 행을 기억하지 못한 파일 ' + lost.length + '개</b> — 다시 올려 주세요: ' + esc(lost.map(function (x) { return x.file + (x.period ? '(' + x.period + ')' : '') + (x.rows != null ? ' ' + C.fmtNum(x.rows) + '행' : ''); }).join(', ')) + '</div>';
    if (state.held.length) h += '<div class="note" data-k="held"><b>FTA 파일 — 다음 단계에서 집계(합계에 넣지 않음)</b><ul>' + state.held.map(function (x, i) { return '<li>' + esc(x.file) + ' — ' + esc(x.label) + ' · ' + C.fmtNum(x.rows) + '행' + (x.warnings && x.warnings.length ? ' · <span class="tag bad-t">' + esc(x.warnings.join(' / ')) + '</span>' : '') + ' <button class="x" type="button" data-drop-held="' + i + '">빼기</button></li>'; }).join('') + '</ul></div>';
    if (state.pending.length) {
      h += '<div class="warn"><b>종류를 골라 주세요</b><ul>' + state.pending.map(function (p, i) {
        return '<li>' + esc(p.file) + ' — 열: ' + esc(p.headers.slice(0, 8).join(', ')) + ' <select data-pending="' + i + '"><option value="">종류 고르기</option>' +
          C.KINDS.map(function (k) { return '<option value="' + k + '">' + esc(label(k)) + '</option>'; }).join('') + '</select> <button class="x" data-drop-pending="' + i + '">빼기</button></li>';
      }).join('') + '</ul></div>';
    }
    if (ks.length) {
      h += '<div class="tablewrap" style="margin-top:12px"><table class="sets"><thead><tr><th>자료</th><th>파일</th><th>자료 기준일<br><small class="sub">(파일을 올린 날)</small></th><th>데이터 기간</th><th>읽은 줄</th><th>건너뛴 줄</th><th>열 확인</th></tr></thead><tbody>';
      ks.forEach(function (k) {
        var s = state.sets[k], m = s.m;
        s.files.forEach(function (f, i) {
          var p = m.files[i], n = p.norm, miss = p.res.missing, open = state.open[openKey(k, f)] || miss.length;
          var ov = m.overlaps.filter(function (o) { return o.a === p.file || o.b === p.file; });
          h += '<tr data-kind="' + k + '" data-file="' + i + '"' + (miss.length ? ' class="flag"' : '') + '><td><b>' + esc(label(k)) + '</b><br><small class="sub">' + esc(C.DATASETS[k].source) + ' · ' + esc(C.DATASETS[k].cycle) + (f.reason ? ' · 근거: ' + esc(f.reason) : '') + '</small>' +
            '<br><label class="sub"><small>종류 바꾸기</small> <select data-rekind="' + k + '" data-i="' + i + '" aria-label="' + esc(f.file) + ' 종류 바꾸기">' +
            C.KINDS.map(function (o) { return '<option value="' + o + '"' + (o === k ? ' selected' : '') + '>' + esc(label(o)) + '</option>'; }).join('') + '</select></label></td>' +
            '<td class="wrapcell">' + esc(f.file) +
            // (v1.8.0) 어느 시트를 몇 줄씩 읽었는지 · 건너뛴 시트
            (p.sheets ? '<br><small class="sub" data-k="sheets">시트 ' + p.sheets.length + '장 합침 — ' + esc(p.sheets.map(function (x) { return x.sheet + ' ' + C.fmtNum(x.n) + '줄'; }).join(' · ')) + '</small>' : '') +
            (p.skippedSheets && p.skippedSheets.length ? '<br><small class="sub" data-k="skipped-sheets">건너뛴 시트: ' + esc(p.skippedSheets.map(function (x) { return x.name + '(' + x.why + ')'; }).join(', ')) + '</small>' : '') +
            fileInfo(k, f, p) +
            '</td><td data-k="asof" title="올린 시각 ' + esc(f.uploadedAt) + '">' + esc(String(f.uploadedAt || '').slice(0, 10) || '—') + '</td><td>' + plabel(n && n.period) + '</td>' +
            '<td class="num">' + (n ? C.fmtNum(n.records.length) : '—') + '</td><td class="num">' + (n ? C.fmtNum(n.skipped.length) : '—') + '</td>' +
            '<td>' + (miss.length ? '<span class="tag bad-t">못 찾은 열 ' + miss.length + '</span>' : '<span class="tag ok-t">필수 열 모두 찾음</span>') +
            (ov.length ? ' <span class="tag bad-t" title="' + esc(ov.map(function (o) { return (o.a === p.file ? o.b : o.a) + ' (' + C.monthLabel(o.from) + ' ~ ' + C.monthLabel(o.to) + ')'; }).join(', ')) + '">기간 겹침 — 중복 집계일 수 있음</span>' : '') +
            (n && n.unknownCodes && n.unknownCodes.length ? ' <span class="tag bad-t" title="본부 번호표에 없는 번호 — 열 확인을 눌러 보세요">새 제품그룹 번호 ' + esc(n.unknownCodes.join('·')) + '</span>' : '') +
            // (v1.7.0) 수출 — 뺀 줄 · 확인할 줄
            // (v1.9.0) 수입(신고번호 열 있음) — 「제외 GN N줄 · 합계 행 N줄」을 늘 보인다
            (n && k === 'import' && p.res.map.declNo ? ' <span class="tag ah-t" data-k="imp-drop" title="실적에서 빼는 줄은 결제방법 GN(설정에서 끌 수 있음)과 맨 아래 신고번호가 빈 합계 행뿐입니다">' + (p.res.map.payment && state.settings.excludeGN !== false ? '제외 GN ' + C.fmtNum(n.excluded.n) + '줄' : 'GN 포함') + ' · 합계 행 ' + C.fmtNum(n.totalRows.n) + '줄</span>' :
            n && n.excluded && n.excluded.n ? ' <span class="tag ah-t" data-k="gn" title="결제방법 GN(샘플 등 무환거래) 줄은 수입 · 수출 실적에서 뺍니다(설정에서 끌 수 있음)">제외 GN ' + C.fmtNum(n.excluded.n) + '줄</span>' : '') +
            (n && n.mismatch && n.mismatch.n ? ' <span class="tag bad-t" data-k="mismatch" title="Monetary Transaction 이 N 인데 Payment 가 GN 이 아니거나 그 반대 — 입력 오류인지 확인(실적에서 빼는 기준은 Payment GN)">무환 · GN 불일치 ' + C.fmtNum(n.mismatch.n) + '줄</span>' : '') +
            (n && n.declBad && n.declBad.n ? ' <span class="tag ah-t" title="빈칸이거나 형식이 다른 신고번호 — 건수에서 빼고 금액은 더합니다">신고번호 확인 필요 ' + C.fmtNum(n.declBad.n) + '줄</span>' : '') +
            (n && n.unclassified && n.unclassified.n ? ' <span class="tag bad-t" title="Plant 번호표에 없는 값 · 빈칸 — 설정에서 표를 고치면 본부로 셉니다">' + esc(C.HQ_UNCLASSIFIED) + ' ' + C.fmtNum(n.unclassified.n) + '줄</span>' : '') +
            ' <button class="x" data-toggle="' + k + '" data-i="' + i + '">' + (open ? '접기' : '열 확인') + '</button>' +
            ' <button class="x" data-drop-file="' + k + '" data-i="' + i + '" aria-label="' + esc(f.file) + ' 빼기">이 파일 빼기</button></td></tr>';
          if (open) h += '<tr class="maprow"><td colspan="7">' + mapTable(k, i) + '</td></tr>';
        });
        // 종류별 합계 줄
        var bad = m.files.filter(function (p) { return !p.ok; }).length, part = [];
        Object.keys(m.partial).forEach(function (key) { var fd = C.DATASETS[k].fields.filter(function (x) { return x.key === key; })[0]; part.push((fd ? fd.label : key) + ' 열 없는 파일: ' + m.partial[key].join(', ')); });
        h += '<tr class="sum" data-kind-sum="' + k + '"><td><b>' + esc(label(k)) + ' 합계</b></td><td>파일 ' + s.files.length + '개</td><td></td><td>' + plabel(m.period) + '</td>' +
          '<td class="num">' + C.fmtNum(m.records.length) + '</td><td class="num">' + C.fmtNum(m.skipped.length) + '</td><td>' +
          (bad ? '<span class="tag bad-t">못 찾은 열이 있는 파일 ' + bad + '개 — 열을 고르거나 그 파일을 빼면 계산합니다</span>' : '<span class="tag ok-t">모두 더해 계산</span>') +
          (k === 'import' && m.map.declNo ? ' <span class="tag ah-t" data-k="imp-drop-sum">제외 GN ' + C.fmtNum(m.excluded) + '줄 · 합계 행 ' + C.fmtNum(m.totalRows) + '줄</span>' : m.excluded ? ' <span class="tag ah-t">제외 GN ' + C.fmtNum(m.excluded) + '줄</span>' : '') +
          (m.overlaps.length ? ' <span class="tag bad-t">기간이 겹칩니다. 중복 집계일 수 있습니다</span>' : '') +
          (part.length ? '<br><small class="sub">' + esc(part.join(' / ')) + '</small>' : '') + '</td></tr>';
      });
      h += '</tbody></table></div><p class="sub" style="margin-top:8px">같은 종류의 엑셀은 따로 올리든 함께 올리든 모두 더해 계산합니다(머리글이 달라도 파일마다 열을 짝지어 합칩니다). 이름이 같은 파일을 다시 올리면 더하지 않고 그 파일만 바꿉니다. 데이터 기간이 겹치는 파일은 중복 집계일 수 있어 알려 드립니다. 필요 없는 파일은 「이 파일 빼기」로 뺍니다.</p>' +
        '<p class="sub" data-k="basis-note" style="margin-top:4px">월 귀속: <b>' + esc(FR.BASIS_TEXT) + '</b>(수입 Declaration date desired 는 희망일이라 쓰지 않음). 파일 이름이 단일 월(2026-09_수입실적)이면 파일 전체를 그 월로, 범위 · 연(2026-01~10 · 2026)이면 행 날짜로 넣습니다.</p>' +
        '<p class="sub" data-k="erp-note" style="margin-top:4px">자료 기준일 = 파일을 올린 날입니다. <b>ERP 는 월 마감 뒤에도 신고가 더해지므로 같은 달 파일을 다시 올리면 숫자가 바뀔 수 있습니다.</b></p>';
    }
    $('d-sets').innerHTML = h;
    $('d-view').hidden = !state.range;
  }
  function mapTable(k, i) {
    var f = state.sets[k].files[i], p = state.sets[k].m.files[i], res = p.res, n = p.norm;
    var h = (res.missing.length ? '<div class="warn">이 열을 찾지 못했습니다: <b>' + esc(res.missing.join(', ')) + '</b>. 아래에서 엑셀의 어느 열인지 골라 주세요. 고르기 전에는 이 종류를 집계하지 않습니다.</div>' : '') +
      '<table class="map"><thead><tr><th>필요한 항목</th><th>엑셀 열</th><th>열 번호</th><th>근거</th><th>예시 값</th></tr></thead><tbody>';
    C.DATASETS[k].fields.forEach(function (fd) {
      var cur = res.map[fd.key] || '', col = cur ? f.headers.indexOf(cur) + 1 : 0;
      h += '<tr' + (fd.req && !cur ? ' class="flag"' : '') + '><td>' + esc(fd.label) + (fd.req ? ' <small class="req">필수</small>' : ' <small class="sub">선택</small>') + '</td>' +
        '<td><select data-map="' + k + '" data-i="' + i + '" data-f="' + fd.key + '"><option value="">(없음)</option>' + f.headers.map(function (hd) { return '<option' + (hd === cur ? ' selected' : '') + '>' + esc(hd) + '</option>'; }).join('') + '</select></td>' +
        '<td class="num" data-k="col">' + (col ? col + '번째' : '—') + '</td>' +
        '<td>' + esc(REASON(res.score[fd.key])) + '</td><td class="wrapcell">' + esc(cur ? example(f, cur) : '') + '</td></tr>';
    });
    h += '</tbody></table>';
    if (res.unused.length) h += '<p class="sub">쓰지 않은 열: ' + esc(res.unused.join(', ')) + '</p>';
    if (n && n.issues.length) h += '<div class="note"><b>읽으며 확인한 것</b><ul>' + n.issues.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' +
      (n.skipped.length ? '<p class="sub" style="margin:6px 0 0">건너뛴 줄: ' + n.skipped.slice(0, 8).map(function (x) { return x.row + '행(' + esc(x.reason) + ')'; }).join(', ') + (n.skipped.length > 8 ? ' 외' : '') + '</p>' : '') + '</div>';
    return h;
  }

  /* ---------- 거르기 ---------- */
  // 지금 탭의 조회 기간 — 결정문 탭은 따로(state.rrange)
  function isRulingRange() { return state.tab === 'ruling' && !!state.rrange; }
  function curRange() { return isRulingRange() ? state.rrange : state.range; }
  function renderFilter() {
    if (!state.range) return;
    var rul = isRulingRange(), cr = curRange();
    var ms = rul ? C.rulingMonths(state.rperiod) : C.monthsBetween(state.period.from, state.period.to);
    var opt = function (v, sel, lab) { return '<option value="' + esc(v) + '"' + (v === sel ? ' selected' : '') + '>' + esc(lab == null ? v : lab) + '</option>'; };
    $('f-from').innerHTML = ms.map(function (m) { return opt(m, cr.from, C.monthLabel(m)); }).join('');
    $('f-to').innerHTML = ms.map(function (m) { return opt(m, cr.to, C.monthLabel(m)); }).join('');
    var hqs = {}, cos = {};
    C.KINDS.forEach(function (k) { var s = ready(k); if (!s) return; C.valuesOf(s.m.records, 'hq').forEach(function (v) { hqs[v] = 1; }); if (C.hasField(k, 'country')) C.valuesOf(s.m.records, 'country').forEach(function (v) { cos[v] = 1; }); });
    $('f-hq').innerHTML = opt('', state.filter.hq || '', '전체') + Object.keys(hqs).sort().map(function (v) { return opt(v, state.filter.hq); }).join('');
    $('f-country').innerHTML = opt('', state.filter.country || '', '전체') + Object.keys(cos).sort().map(function (v) { return opt(v, state.filter.country); }).join('');
    $('f-unit').value = state.unit;
    if (rul) {
      $('f-note').innerHTML = '결정문 조회 기간 <b>' + C.monthLabel(cr.from) + ' ~ ' + C.monthLabel(cr.to) + '</b> · ' + esc(C.RULING_BASIS) +
        ' · 결정문 탭은 기간을 따로 가집니다(기본 ' + C.monthLabel(C.RULING_BASE_FROM) + '부터, 다른 탭 기간은 그대로) · 금액 단위는 올린 파일 그대로입니다(' + esc(state.unit) + ').';
      return;
    }
    var pr = C.prevRange(state.range);
    $('f-note').innerHTML = '조회 기간 <b>' + C.monthLabel(state.range.from) + ' ~ ' + C.monthLabel(state.range.to) + '</b> · 전년 동기 ' + C.monthLabel(pr.from) + ' ~ ' + C.monthLabel(pr.to) +
      (pr.overlap ? ' <span class="tag bad-t">12개월을 넘게 골라 전년 동기와 겹칩니다</span>' : '') + ' · 금액 단위는 올린 파일 그대로입니다(' + esc(state.unit) + ').';
  }
  function filtered(k) {
    var s = ready(k); if (!s) return null;
    var f = C.applyFilter(s.m.records, k, { hq: state.filter.hq, country: state.filter.country });
    return { recs: f.records, ignored: f.ignored, set: s };
  }

  /* ---------- 그림(SVG) ---------- */
  var COL = ['#154b6e', '#0b6e99', '#0a6045', '#b07a12', '#6b4fa0'], PREV = '#9fb2c4';
  function niceMax(v) { if (!(v > 0)) return 1; var p = Math.pow(10, Math.floor(Math.log(v) / Math.LN10)), n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }
  function axisFmt(kind) { return kind === 'pct' ? function (v) { return C.fmtPct(v, 0); } : kind === 'count' ? function (v) { return C.fmtNum(v); } : function (v) { return C.fmtShort(v, state.unit).replace(/원$/, '').replace(' ' + state.unit, ''); }; }
  function legend(series, x0) { var x = x0; return series.map(function (s, i) { var t = '<rect x="' + x + '" y="8" width="11" height="11" rx="2" fill="' + s.color + '"/><text x="' + (x + 15) + '" y="18" class="lg">' + esc(s.name) + '</text>'; x += 30 + s.name.length * 12; return t; }).join(''); }
  function frame(title, svg) { return '<figure class="chart-box"><figcaption>' + esc(title) + '</figcaption>' + svg + '</figure>'; }
  // 월별 막대(묶음) 또는 선. type: 'bar' | 'line'
  function monthChart(title, months, series, type, fmtKind) {
    var W = 640, H = 250, L = 62, R = 12, T = 30, B = 30, iw = W - L - R, ih = H - T - B;
    var max = niceMax(Math.max.apply(null, [0].concat.apply([], series.map(function (s) { return s.values.filter(function (v) { return v != null; }); }))));
    var fmt = axisFmt(fmtKind), step = iw / Math.max(1, months.length), y = function (v) { return T + ih - (v / max) * ih; };
    var b = legend(series, L);
    for (var g = 0; g <= 4; g++) { var gv = max * g / 4; b += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(gv) + '" y2="' + y(gv) + '" class="grid"/><text x="' + (L - 6) + '" y="' + (y(gv) + 4) + '" class="ax" text-anchor="end">' + esc(fmt(gv)) + '</text>'; }
    var every = Math.ceil(months.length / 12);
    months.forEach(function (m, i) { if (i % every === 0) b += '<text x="' + (L + step * i + step / 2) + '" y="' + (H - 10) + '" class="ax" text-anchor="middle">' + esc(m.slice(2, 4) + '.' + m.slice(5, 7)) + '</text>'; });
    if (type === 'bar') {
      var bw = Math.max(2, (step * 0.72) / series.length);
      series.forEach(function (s, si) { s.values.forEach(function (v, i) { if (v == null || v <= 0) return; var x = L + step * i + step * 0.14 + bw * si; b += '<rect x="' + x.toFixed(1) + '" y="' + y(v).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + (T + ih - y(v)).toFixed(1) + '" fill="' + s.color + '"><title>' + esc(C.monthLabel(months[i]) + ' ' + s.name + ' ' + s.fmt(v)) + '</title></rect>'; }); });
    } else {
      series.forEach(function (s) {
        var seg = [], segs = [];
        s.values.forEach(function (v, i) { if (v == null) { if (seg.length) segs.push(seg); seg = []; } else seg.push([L + step * i + step / 2, y(v), v, i]); });
        if (seg.length) segs.push(seg);
        segs.forEach(function (sg) { b += '<polyline fill="none" stroke="' + s.color + '" stroke-width="2.4"' + (s.dash ? ' stroke-dasharray="6 4"' : '') + ' points="' + sg.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '"/>'; });
        segs.forEach(function (sg) { sg.forEach(function (p) { b += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3" fill="' + s.color + '"><title>' + esc(C.monthLabel(months[p[3]]) + ' ' + s.name + ' ' + s.fmt(p[2])) + '</title></circle>'; }); });
      });
    }
    return frame(title, '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(title) + '">' + b + '</svg>');
  }
  // 가로 막대 — 상위 N
  function hbar(title, rows, fmt, color) {
    var W = 640, rowH = 26, L = 170, R = 110, T = 8, H = T + rows.length * rowH + 8;
    var max = niceMax(Math.max.apply(null, [0].concat(rows.map(function (r) { return r.value || 0; }))));
    var b = '';
    rows.forEach(function (r, i) {
      var yy = T + i * rowH, w = r.value > 0 ? (r.value / max) * (W - L - R) : 0, lab = String(r.label);
      if (lab.length > 13) lab = lab.slice(0, 12) + '…';
      b += '<text x="' + (L - 8) + '" y="' + (yy + 17) + '" class="ax lab" text-anchor="end"><title>' + esc(r.label) + '</title>' + esc(lab) + '</text>' +
        '<rect x="' + L + '" y="' + (yy + 5) + '" width="' + w.toFixed(1) + '" height="16" rx="3" fill="' + (color || COL[0]) + '"/>' +
        '<text x="' + (L + w + 6).toFixed(1) + '" y="' + (yy + 17) + '" class="ax">' + esc(fmt(r.value)) + '</text>';
    });
    if (!rows.length) b = '<text x="20" y="24" class="ax">데이터 없음</text>';
    return frame(title, '<svg class="chart" viewBox="0 0 ' + W + ' ' + Math.max(H, 40) + '" role="img" aria-label="' + esc(title) + '">' + b + '</svg>');
  }

  /* ---------- 카드·표 ---------- */
  function money(v) { return C.fmtShort(v, state.unit); }
  function kpi(label, value, sub, how, key) {
    return '<div class="kpi"' + (key ? ' data-k="' + key + '"' : '') + '><span class="kpi-l">' + esc(label) + '</span><b class="kpi-v">' + esc(value) + '</b>' +
      (sub ? '<small>' + sub + '</small>' : '') + (how ? '<span class="kpi-how">' + esc(how) + '</span>' : '') + '</div>';
  }
  function empty(k) { return '<div class="kpi empty"><span class="kpi-l">' + esc(C.DATASETS[k].label) + '</span><b class="kpi-v">자료 없음</b><small>' + esc(C.DATASETS[k].source) + '를 올리면 보입니다' + (state.sets[k] ? ' — 못 찾은 열을 먼저 골라 주세요' : '') + '</small></div>'; }
  function ignoredNote(list) { return list && list.length ? '<p class="sub">이 자료에는 ' + esc(list.join('·')) + ' 열이 없어 ' + esc(list.join('·')) + ' 조건을 걸지 않았습니다.</p>' : ''; }
  function table(head, rows, foot, cls) {
    return '<div class="tablewrap"><table class="' + (cls || '') + '"><thead><tr>' + head.map(function (h, i) { return '<th' + (i ? ' class="num"' : '') + '>' + h + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) { return '<tr' + (r.cls ? ' class="' + r.cls + '"' : '') + '>' + r.cells.map(function (c, i) { return '<td' + (i ? ' class="num"' : '') + '>' + c + '</td>'; }).join('') + '</tr>'; }).join('') +
      (foot ? '<tr class="sum">' + foot.map(function (c, i) { return '<td' + (i ? ' class="num"' : '') + '>' + c + '</td>'; }).join('') + '</tr>' : '') + '</tbody></table></div>';
  }
  function n0(v) { return esc(C.fmtNum(v)); }
  function signCls(v) { return v == null ? '' : v < 0 ? ' class="neg"' : v > 0 ? ' class="pos"' : ''; }
  function sp(v, txt) { return '<span' + signCls(v) + '>' + esc(txt) + '</span>'; }

  // (v1.7.0) 두 탭 맨 위 「수출입 합계」 한 줄 — 계산은 C.tradeTotal
  function tradeTotalLine() {
    var fi = filtered('import'), fe = filtered('export'), t = C.tradeTotal(fi ? fi.recs : null, fe ? fe.recs : null, state.range);
    var parts = (fi ? '수입 물자대 ' + esc(money(t.importGoods)) + ' · ' + C.fmtNum(t.importN) + '건' : '수입 자료 없음') + ' + ' +
      (fe ? '수출금액 ' + esc(money(t.exportAmount)) + ' · ' + C.fmtNum(t.exportN) + '건' : '수출 자료 없음');
    return '<p class="trade-total-line" data-k="trade-total"><b>수출입 합계</b> <span class="tt-v">' + (t.both ? esc(money(t.amount)) + ' · ' + C.fmtNum(t.n) + '건' : '—') + '</span>' +
      ' <small>(' + parts + (t.both ? '' : ' — 두 자료가 모두 있어야 합계를 냅니다') + (fi && fi.set.m.map.declNo ? ' · 수입 · 수출 건수는 신고번호 기준' : ' · 수출 건수는 신고번호 기준') + ')</small></p>';
  }
  // (v1.9.0) 월별 물자대 · 관세 막대(왼쪽 축) + 관세부담율 선(오른쪽 축, %)
  function importChart(title, months, goods, duty, burden) {
    var W = 640, H = 250, L = 62, R = 46, T = 30, B = 30, iw = W - L - R, ih = H - T - B;
    var maxA = niceMax(Math.max.apply(null, [0].concat(goods.concat(duty).filter(function (v) { return v != null; })))), maxP = niceMax(Math.max.apply(null, [0].concat(burden.filter(function (v) { return v != null; }))));
    var fmt = axisFmt('money'), step = iw / Math.max(1, months.length), ya = function (v) { return T + ih - (v / maxA) * ih; }, yp = function (v) { return T + ih - (v / maxP) * ih; };
    var b = legend([{ name: '물자대', color: COL[0] }, { name: '관세', color: COL[3] }, { name: '관세부담율', color: COL[4] }], L);
    for (var g = 0; g <= 4; g++) {
      b += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + ya(maxA * g / 4) + '" y2="' + ya(maxA * g / 4) + '" class="grid"/><text x="' + (L - 6) + '" y="' + (ya(maxA * g / 4) + 4) + '" class="ax" text-anchor="end">' + esc(fmt(maxA * g / 4)) + '</text>' +
        '<text x="' + (W - R + 6) + '" y="' + (yp(maxP * g / 4) + 4) + '" class="ax">' + esc(C.fmtPct(maxP * g / 4, 1)) + '</text>';
    }
    var every = Math.ceil(months.length / 12), bw = Math.max(2, step * 0.34), segs = [], seg = [];
    months.forEach(function (m, i) {
      var cx = L + step * i + step / 2;
      if (i % every === 0) b += '<text x="' + cx + '" y="' + (H - 10) + '" class="ax" text-anchor="middle">' + esc(m.slice(2, 4) + '.' + m.slice(5, 7)) + '</text>';
      [[goods[i], COL[0], '물자대', -bw], [duty[i], COL[3], '관세', 0]].forEach(function (x) {
        if (x[0] != null && x[0] > 0) b += '<rect x="' + (cx + x[3]).toFixed(1) + '" y="' + ya(x[0]).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + (T + ih - ya(x[0])).toFixed(1) + '" fill="' + x[1] + '"><title>' + esc(C.monthLabel(m) + ' ' + x[2] + ' ' + money(x[0])) + '</title></rect>';
      });
      if (burden[i] == null) { if (seg.length) segs.push(seg); seg = []; } else seg.push([cx, yp(burden[i]), burden[i], m]);
    });
    if (seg.length) segs.push(seg);
    segs.forEach(function (sg) {
      b += '<polyline fill="none" stroke="' + COL[4] + '" stroke-width="2.4" points="' + sg.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '"/>';
      sg.forEach(function (p) { b += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3" fill="' + COL[4] + '"><title>' + esc(C.monthLabel(p[3]) + ' 관세부담율 ' + C.fmtPct(p[2], 2)) + '</title></circle>'; });
    });
    return frame(title, '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(title) + '">' + b + '</svg>');
  }
  // 「수입 실적」 탭 — (v1.9.0) 계산은 C.importReport · C.importStats. 여기서는 그리기만 한다.
  function renderTrade() {
    $('sum-trade').innerHTML = tradeTotalLine();
    var fi = filtered('import');
    if (!fi) { $('kpi-trade').innerHTML = empty('import'); ['ch-trade', 'tb-trade-report', 'ch-trade-by', 'tb-trade'].forEach(function (id) { $(id).innerHTML = ''; }); return; }
    var m = fi.set.m, has = { payment: !!m.map.payment, declNo: !!m.map.declNo, supplier: !!m.map.supplier }, hasHs = !!m.map.hs;
    var bySel = $('by-trade'), hsOpt = bySel.querySelector('option[value="hs4"]');
    hsOpt.disabled = !hasHs; hsOpt.textContent = hasHs ? 'HS 4단위' : 'HS 4단위(HS 열 없음)';
    if (!hasHs && bySel.value === 'hs4') bySel.value = 'hq';
    var by = bySel.value, top = +$('top-trade').value, BYL = C.BY[by];
    var r = C.importReport(fi.recs, state.range, state.settings, has), s = C.importStats(fi.recs, state.range, by);
    var base = C.monthLabel(r.base), k = '', ch = '', tb = '', pct2 = function (v) { return esc(C.fmtPct(v, 2)); };
    var notes = ['<b>기준</b> ' + esc(r.basis), '전월 · 전년 동월 대비는 기준월 <b>' + base + '</b>(조회 기간의 마지막 달)'];
    if (has.declNo) notes.push('<span data-k="imp-drop">' + (state.settings.excludeGN === false && has.payment ? 'GN 포함(설정에서 껐습니다)' : '제외 GN ' + C.fmtNum(m.excluded) + '줄') + ' · 합계 행 ' + C.fmtNum(m.totalRows) + '줄(파일 전체)</span>');
    else if (has.payment) notes.push(state.settings.excludeGN === false ? '결제방법 GN(무환) 포함 — 설정에서 껐습니다' : '제외 GN ' + C.fmtNum(m.excluded) + '줄(파일 전체)');
    if (r.total.badN) notes.push('신고번호 확인 필요 ' + C.fmtNum(r.total.badN) + '줄 — 건수에서 빼고 금액은 더함');
    if (r.total.dutyExcl != null) notes.push('보세공장(B) 관세 ' + esc(money(r.total.dutyExcl)) + '는 관세 합계에서 뺐습니다');
    if (r.unclassified.rows) notes.push('<b>' + esc(C.HQ_UNCLASSIFIED) + ' ' + C.fmtNum(r.unclassified.n) + '건 · ' + esc(money(r.unclassified.goods)) + '</b>' + (r.unclassified.codes.length ? '(Plant ' + esc(r.unclassified.codes.join('·')) + ')' : '(Plant 빈칸)') + ' — 설정에서 Plant 표를 고치면 본부로 셉니다');
    k += '<p class="rul-basis" data-k="imp-basis">' + notes.join(' · ') + '</p>';
    function vsSub(v) {
      if (v.goods.prev == null && v.goods.rate == null && v.n.prev == null) return C.monthLabel(v.month) + ' 자료 없음';
      return base + ' vs ' + C.monthLabel(v.month) + ' · ' + sp(v.goods.diff, (v.goods.diff > 0 ? '+' : '') + money(v.goods.diff)) + ' · 건수 ' + esc(C.fmtSigned(v.n.diff)) + '건';
    }
    var per = C.monthLabel(state.range.from) + ' ~ ' + C.monthLabel(state.range.to);
    k += kpi('수입 물자대', money(r.total.goods), per, '합계' + (has.payment ? ' · ' + (state.settings.excludeGN === false ? 'GN 포함' : 'GN 제외') : ''), 'imp-goods') +
      kpi('관세', money(r.total.duty), has.declNo ? '보세공장(B) 관세 제외' : '', '합계(Tot.Duty Amt)', 'imp-duty') +
      kpi('관세부담율', C.fmtPct(r.total.burden, 2), '', '계산: 관세 ÷ 물자대', 'imp-burden') +
      kpi('수입 건수', C.fmtNum(r.total.n) + '건', has.declNo ? '신고번호 고유 개수' + (r.total.badN ? ' · 확인 필요 ' + r.total.badN + '줄 제외' : '') : '줄 수', has.declNo ? '같은 신고번호 여러 줄 = 1건' : '', 'imp-n') +
      kpi('전월 대비', C.fmtSignedPct(r.mom.goods.rate), vsSub(r.mom), '계산: (기준월 − 전월) ÷ 전월 · 물자대', 'imp-mom') +
      kpi('전년 동월 대비', C.fmtSignedPct(r.yoy.goods.rate), vsSub(r.yoy), '계산: (기준월 − 전년 같은 달) ÷ 전년 같은 달 · 물자대', 'imp-yoy');
    ch += importChart('월별 수입 물자대 · 관세 · 관세부담율', r.months, r.monthly.map(function (c) { return c.goods; }), r.monthly.map(function (c) { return c.duty; }), r.monthly.map(function (c) { return c.burden; }));
    if (r.suppliers) ch += hbar('공급지역(Supplier)별 물자대 상위 10', r.suppliers.map(function (c) { return { label: c.key, value: c.goods }; }), money, COL[0]);
    // 표 ① 본부 × 월
    var head = ['본부'];
    r.months.map(C.monthLabel).forEach(function (lab) { head.push(esc(lab) + '<br><small>건수</small>', esc(lab) + '<br><small>물자대</small>', esc(lab) + '<br><small>관세</small>', esc(lab) + '<br><small>부담율</small>'); });
    head.push('기간 합계<br><small>건수</small>', '기간 합계<br><small>물자대</small>', '기간 합계<br><small>관세</small>', '기간 합계<br><small>부담율</small>');
    var c4 = function (x) { return [n0(x.n), n0(x.goods), n0(x.duty), pct2(x.burden)]; };
    var rows = r.pivot.map(function (p) {
      var c = [esc(p.hq)]; p.months.forEach(function (x) { c = c.concat(c4(x)); });
      return { cls: p.unclassified ? 'uncl' : '', cells: c.concat(c4(p.total)) };
    });
    var foot = ['합계']; r.monthly.forEach(function (x) { foot = foot.concat(c4(x)); });
    tb += '<h3 class="tb-h">① 본부 × 월 — 건수 · 물자대 · 관세 · 관세부담율</h3><p class="sub">' + esc(r.basis) + ' · 본부 순서는 설정의 Plant 표 → 그 밖 → ' + esc(C.HQ_UNCLASSIFIED) + '. 본부별 건수를 더하면 합계보다 클 수 있습니다(한 신고번호가 여러 본부에 걸칠 때).</p>' + ignoredNote(fi.ignored) +
      table(head, rows, foot.concat(c4(r.total)), 'imp-pivot');
    // 표 ② 공급지역 상위 10
    tb += '<h3 class="tb-h">② 공급지역(Supplier) 상위 10 — 물자대 큰 순 · 비중</h3>' + (r.suppliers ?
      table(['공급지역', '건수', '물자대', '비중'], r.suppliers.concat(r.supplierRest ? [r.supplierRest] : []).map(function (c) { return { cls: c === r.supplierRest ? 'rest' : '', cells: [esc(c.key), n0(c.n), n0(c.goods), esc(C.fmtPct(c.share))] }; }),
        ['합계(' + r.supplierN + '곳)', n0(r.total.n), n0(r.total.goods), r.total.goods ? '100.0%' : '—'], 'imp-supplier') : '<p class="sub" data-k="no-supplier">이 자료에는 공급지역(Supplier) 열이 없습니다.</p>');
    // 표 ③ 신고 종류
    tb += '<h3 class="tb-h">③ 신고 종류별 — 신고번호 끝 글자(M 일반 수입 · B 보세공장 사용신고)</h3>' + (r.declTypes ?
      '<p class="sub">모두 실적(건수 · 물자대)에 넣습니다. 보세공장 사용신고(B)의 관세는 관세 합계에서 빼고 참고로만 보입니다.</p>' +
      table(['신고 종류', '건수', '물자대', '관세', '관세 집계 제외(참고)'], r.declTypes.map(function (t) { return { cells: [esc(t.label), n0(t.n), n0(t.goods), t.dutyExcluded ? '<span class="sub">집계 제외</span>' : n0(t.duty), t.dutyExcluded ? n0(t.dutyExcl) : '—'] }; }),
        ['합계', n0(r.total.n), n0(r.total.goods), n0(r.total.duty), n0(r.total.dutyExcl)], 'imp-decltype') : '<p class="sub" data-k="no-decl">이 자료에는 신고번호 열이 없어 신고 종류를 나누지 않습니다.</p>');
    $('kpi-trade').innerHTML = k; $('ch-trade').innerHTML = ch; $('tb-trade-report').innerHTML = tb;
    // 묶음별 물자대 · 관세(v1.8.0 까지의 수입 표) — 그대로 아래에 둔다
    var t = C.topN(s.groups, top);
    $('ch-trade-by').innerHTML = hbar(BYL + '별 수입 물자대 상위 ' + top, t.rows.map(function (g) { return { label: g.key, value: g.goods }; }), money, COL[0]);
    $('tb-trade').innerHTML = '<h3 class="tb-h">수입 — ' + esc(BYL) + '별 물자대 · 관세 · 관세부담율</h3>' +
      table([esc(BYL), '건수', '물자대', '관세', '관세부담율'], t.rows.concat(t.rest ? [t.rest] : []).map(function (g) { return { cls: g === t.rest ? 'rest' : '', cells: [esc(g.key), n0(g.n), n0(g.goods), n0(g.duty), pct2(g.burden)] }; }),
        ['합계', n0(s.n), n0(s.goods), n0(s.duty), pct2(s.burden)], 'trade-imp');
  }
  // (v1.7.0) 월별 금액 막대 + 건수 선(오른쪽 축)
  function comboChart(title, months, amounts, counts) {
    var W = 640, H = 250, L = 62, R = 46, T = 30, B = 30, iw = W - L - R, ih = H - T - B;
    var maxA = niceMax(Math.max.apply(null, [0].concat(amounts.filter(function (v) { return v != null; })))), maxN = niceMax(Math.max.apply(null, [0].concat(counts)));
    var fmt = axisFmt('money'), step = iw / Math.max(1, months.length), ya = function (v) { return T + ih - (v / maxA) * ih; }, yn = function (v) { return T + ih - (v / maxN) * ih; };
    var b = legend([{ name: '금액(FOB)', color: COL[2] }, { name: '건수', color: COL[3] }], L);
    for (var g = 0; g <= 4; g++) {
      b += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + ya(maxA * g / 4) + '" y2="' + ya(maxA * g / 4) + '" class="grid"/><text x="' + (L - 6) + '" y="' + (ya(maxA * g / 4) + 4) + '" class="ax" text-anchor="end">' + esc(fmt(maxA * g / 4)) + '</text>' +
        '<text x="' + (W - R + 6) + '" y="' + (yn(maxN * g / 4) + 4) + '" class="ax">' + esc(C.fmtNum(maxN * g / 4)) + '</text>';
    }
    var every = Math.ceil(months.length / 12), bw = Math.max(2, step * 0.6), pts = [];
    months.forEach(function (m, i) {
      var cx = L + step * i + step / 2;
      if (i % every === 0) b += '<text x="' + cx + '" y="' + (H - 10) + '" class="ax" text-anchor="middle">' + esc(m.slice(2, 4) + '.' + m.slice(5, 7)) + '</text>';
      var v = amounts[i]; if (v != null && v > 0) b += '<rect x="' + (cx - bw / 2).toFixed(1) + '" y="' + ya(v).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + (T + ih - ya(v)).toFixed(1) + '" fill="' + COL[2] + '"><title>' + esc(C.monthLabel(m) + ' 금액 ' + money(v)) + '</title></rect>';
      pts.push([cx, yn(counts[i] || 0), counts[i] || 0, m]);
    });
    if (pts.length) {
      b += '<polyline fill="none" stroke="' + COL[3] + '" stroke-width="2.4" points="' + pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '"/>';
      pts.forEach(function (p) { b += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3" fill="' + COL[3] + '"><title>' + esc(C.monthLabel(p[3]) + ' 건수 ' + C.fmtNum(p[2]) + '건') + '</title></circle>'; });
    }
    return frame(title, '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(title) + '">' + b + '</svg>');
  }
  // (v1.7.0) 「수출 실적」 탭 — 계산은 C.exportReport · C.exportStats. 여기서는 그리기만 한다.
  function renderExport() {
    $('sum-export').innerHTML = tradeTotalLine();
    var fe = filtered('export');
    if (!fe) { $('kpi-export').innerHTML = empty('export'); ['ch-export', 'tb-export-report', 'ch-export-by', 'tb-export'].forEach(function (id) { $(id).innerHTML = ''; }); return; }
    var m = fe.set.m, hasHs = !!m.map.hs, bySel = $('by-export'), hsOpt = bySel.querySelector('option[value="hs4"]');
    hsOpt.disabled = !hasHs; hsOpt.textContent = hasHs ? 'HS 4단위' : 'HS 4단위(HS 열 없음)';
    if (!hasHs && bySel.value === 'hs4') bySel.value = 'hq';
    var by = bySel.value, top = +$('top-export').value, BYL = C.BY[by];
    var r = C.exportReport(fe.recs, state.range, state.settings), e = C.exportStats(fe.recs, state.range, by);
    var base = C.monthLabel(r.base), k = '', ch = '', tb = '';
    var notes = ['<b>기준</b> ' + esc(r.basis), '전월 · 전년 동월 대비는 기준월 <b>' + base + '</b>(조회 기간의 마지막 달)'];
    if (m.excluded) notes.push('제외 GN ' + C.fmtNum(m.excluded) + '줄(파일 전체)');
    else if (state.settings.excludeGN === false) notes.push('설정에서 GN 제외를 껐습니다');
    if (r.total.badN) notes.push('신고번호 확인 필요 ' + C.fmtNum(r.total.badN) + '줄 — 건수에서 빼고 금액은 더함');
    if (r.unclassified.rows) notes.push('<b>' + esc(C.HQ_UNCLASSIFIED) + ' ' + C.fmtNum(r.unclassified.n) + '건 · ' + esc(money(r.unclassified.amount)) + '</b>' + (r.unclassified.codes.length ? '(Plant ' + esc(r.unclassified.codes.join('·')) + ')' : '(Plant 빈칸)') + ' — 설정에서 Plant 표를 고치면 본부로 셉니다');
    k += '<p class="rul-basis" data-k="exp-basis">' + notes.join(' · ') + '</p>';
    function vsSub(v, label) {
      if (v.amount.prev == null && v.amount.rate == null && v.n.prev == null) return C.monthLabel(v.month) + ' 자료 없음';
      return base + ' vs ' + C.monthLabel(v.month) + ' · ' + sp(v.amount.diff, (v.amount.diff > 0 ? '+' : '') + money(v.amount.diff)) + ' · 건수 ' + esc(C.fmtSigned(v.n.diff)) + '건';
    }
    k += kpi('수출금액(FOB 원화)', money(r.total.amount), C.monthLabel(state.range.from) + ' ~ ' + C.monthLabel(state.range.to), '합계 · ' + (state.settings.excludeGN === false ? 'GN 포함' : 'GN 제외'), 'exp-amount') +
      kpi('수출 건수', C.fmtNum(r.total.n) + '건', '신고번호 고유 개수' + (r.total.badN ? ' · 확인 필요 ' + r.total.badN + '줄 제외' : ''), '같은 신고번호 여러 줄 = 1건', 'exp-n') +
      kpi('전월 대비', C.fmtSignedPct(r.mom.amount.rate), vsSub(r.mom), '계산: (기준월 − 전월) ÷ 전월', 'exp-mom') +
      kpi('전년 동월 대비', C.fmtSignedPct(r.yoy.amount.rate), vsSub(r.yoy), '계산: (기준월 − 전년 같은 달) ÷ 전년 같은 달', 'exp-yoy');
    ch += comboChart('월별 수출금액 · 건수', r.months, r.monthly.map(function (c) { return c.amount; }), r.monthly.map(function (c) { return c.n; }));
    ch += hbar('국가별 수출금액 상위 10', r.countries.map(function (c) { return { label: c.key, value: c.amount }; }), money, COL[2]);
    // 표 ① 본부 × 월(월말 보고 모양)
    var head = ['본부'], mh = r.months.map(C.monthLabel);
    mh.forEach(function (lab) { head.push(esc(lab) + '<br><small>건수</small>', esc(lab) + '<br><small>FOB</small>'); });
    head.push('기간 합계<br><small>건수</small>', '기간 합계<br><small>FOB</small>', '전월 대비<br><small>' + base + ' FOB</small>');
    var rows = r.pivot.map(function (p) {
      var c = [esc(p.hq)];
      p.months.forEach(function (x) { c.push(n0(x.n), n0(x.amount)); });
      c.push(n0(p.total.n), n0(p.total.amount), sp(p.mom.amount.rate, C.fmtSignedPct(p.mom.amount.rate)));
      return { cls: p.unclassified ? 'uncl' : '', cells: c };
    });
    var foot = ['합계']; r.monthly.forEach(function (x) { foot.push(n0(x.n), n0(x.amount)); });
    foot.push(n0(r.total.n), n0(r.total.amount), sp(r.mom.amount.rate, C.fmtSignedPct(r.mom.amount.rate)));
    tb += '<h3 class="tb-h">① 본부 × 월 — 건수 · FOB(원)</h3><p class="sub">' + esc(r.basis) + ' · 본부 순서는 설정의 Plant 표 → 그 밖 → ' + esc(C.HQ_UNCLASSIFIED) + '. 본부별 건수를 더하면 합계보다 클 수 있습니다(한 신고번호가 여러 본부에 걸칠 때).</p>' + ignoredNote(fe.ignored) +
      table(head, rows, foot, 'exp-pivot');
    // 표 ② 국가 상위 10
    tb += '<h3 class="tb-h">② 국가(Destination) 상위 10 — 금액 큰 순 · 비중</h3>' +
      table(['국가', '건수', 'FOB(원)', '비중'], r.countries.concat(r.countryRest ? [r.countryRest] : []).map(function (c) { return { cls: c === r.countryRest ? 'rest' : '', cells: [esc(c.key), n0(c.n), n0(c.amount), esc(C.fmtPct(c.share))] }; }),
        ['합계(' + r.countryN + '개국)', n0(r.total.n), n0(r.total.amount), r.total.amount ? '100.0%' : '—'], 'exp-country');
    $('kpi-export').innerHTML = k; $('ch-export').innerHTML = ch; $('tb-export-report').innerHTML = tb;
    // 묶음별 전년 동기 대비(v1.6.0 까지의 수출 표) — 그대로 아래에 둔다
    var months = C.monthsBetween(state.range.from, state.range.to), te = C.topN(e.groups, top), cb = '';
    cb += monthChart('월별 수출금액 — 올해와 전년 동기', months, [{ name: '올해', color: COL[2], values: e.monthly.map(function (x) { return x.amount; }), fmt: money }, { name: '전년 동기', color: PREV, dash: true, values: e.monthly.map(function (x) { return x.prev; }), fmt: money }], 'line');
    cb += hbar(BYL + '별 수출금액 상위 ' + top, te.rows.map(function (g) { return { label: g.key, value: g.amount }; }), money, COL[2]);
    $('ch-export-by').innerHTML = cb;
    $('tb-export').innerHTML = '<h3 class="tb-h">' + esc(BYL) + '별 수출금액 전년 동기 대비</h3>' + (e.hasPrev ? '' : '<p class="sub">전년 동기 자료가 없습니다.</p>') +
      table([esc(BYL), '건수', '수출금액', '전년 동기', '증감', '증감률'], te.rows.concat(te.rest ? [te.rest] : []).map(function (g) {
        return { cls: g === te.rest ? 'rest' : '', cells: [esc(g.key), n0(g.n), n0(g.amount), n0(g.prev), sp(g.diff, C.fmtSigned(g.diff)), sp(g.rate, C.fmtSignedPct(g.rate))] };
      }), ['합계', n0(e.n), n0(e.amount), n0(e.prev), sp(e.diff, C.fmtSigned(e.diff)), sp(e.rate, C.fmtSignedPct(e.rate))], 'trade-exp');
  }
  // (v1.7.0) 설정 — Plant → 본부 표 · GN 제외. 값 정리는 C.exportSettings, 저장은 이 브라우저.
  function renderSettings() {
    var st = state.settings;
    $('d-settings-body').innerHTML = '<label class="chk"><input type="checkbox" id="set-gn"' + (st.excludeGN ? ' checked' : '') + '> 결제방법 <b>' + esc(C.EXPORT_EXCLUDE_PAYMENT) + '</b>(샘플 등 무환거래) 줄을 <b>수입 · 수출</b> 실적에서 빼기(기본 켜짐) — 수입은 「Payment method」, 수출은 「Payment」 열</label>' +
      '<p class="sub" style="margin:8px 0 4px">Plant 번호 → 본부(수입 · 수출 같은 표). 1131(엔진본부)은 표를 고쳐도 늘 들어갑니다. 표에 없는 번호 · 빈칸은 「' + esc(C.HQ_UNCLASSIFIED) + '」로 따로 셉니다. 글자로 적힌 본부 이름은 그대로 둡니다.</p>' +
      '<div class="tablewrap"><table class="set-plant"><thead><tr><th>Plant 번호</th><th>본부</th><th></th></tr></thead><tbody>' +
      st.rows.map(function (r, i) { return '<tr><td><input type="text" data-set="code" value="' + esc(r.code) + '" aria-label="Plant 번호 ' + (i + 1) + '"></td><td><input type="text" data-set="hq" value="' + esc(r.hq) + '" aria-label="본부 ' + (i + 1) + '"></td><td><button class="x" type="button" data-set-del="' + i + '">빼기</button></td></tr>'; }).join('') +
      '<tr class="new"><td><input type="text" data-set-new="code" placeholder="새 번호"></td><td><input type="text" data-set-new="hq" placeholder="본부 이름"></td><td><button class="x" type="button" data-set-add>더하기</button></td></tr>' +
      '</tbody></table></div><div class="btnrow" style="margin-top:8px"><button class="btn" type="button" data-set-reset>기본 표로 되돌리기</button>' +
      '<span class="sub">' + (st.custom ? '고친 표를 쓰는 중 · ' : '기본 표 · ') + '이 브라우저에만 저장됩니다(다른 PC · 다른 사람은 기본 표)</span></div>';
  }
  function settingsFromForm(extra) {
    var rows = [];
    document.querySelectorAll('#d-settings-body table.set-plant tbody tr:not(.new)').forEach(function (tr, i) {
      if (extra && extra.del === i) return;
      rows.push({ code: tr.querySelector('[data-set="code"]').value, hq: tr.querySelector('[data-set="hq"]').value });
    });
    if (extra && extra.add) rows.push(extra.add);
    return { plant: rows, excludeGN: $('set-gn').checked };
  }
  function applySettings(raw, text) {
    saveSettings(raw); renderSettings();
    var note = Object.keys(state.sets).length ? rebuild(false) : '';
    msg(text + (Object.keys(state.sets).length ? ' 올린 수출 자료를 다시 계산했습니다.' : '') + note, note ? 'warn' : 'ok');
  }
  // (v1.9.1) 관세율표 — FTA 탭을 처음 열 때 한 번만 받는다(js/tariff.js 가 캐시). 실패해도 다른 집계는 그대로.
  function showTariffMeta() {
    var el = $('tariff-meta'), T = window.Tariff;
    if (!el || !T || el.dataset.state) return;
    el.dataset.state = 'loading'; el.textContent = '관세율표를 불러오는 중…';
    T.loadTariff().then(function (r) {
      el.dataset.state = r.ok ? 'ok' : 'fail';
      el.classList.toggle('warn', !r.ok);
      el.textContent = r.ok ? T.tariffMetaText(r.meta) + ' (' + r.meta.source + ')' : T.FAIL_TEXT + ' — 세율 조회만 건너뜁니다.';
    });
  }
  function renderFta() {
    showTariffMeta();
    var by = $('by-fta').value, BYL = C.BY[by], k = '', ch = '', tb = '', months = C.monthsBetween(state.range.from, state.range.to), monthly = [];
    ['import', 'export'].forEach(function (kind, i) {
      var f = filtered(kind), nm = kind === 'import' ? '수입' : '수출';
      if (!f) { k += empty(kind); return; }
      var s = C.ftaStats(f.recs, kind, state.range, by, f.set.m.map), part = f.set.m.partial;
      if (!s.available) { k += kpi(nm + ' FTA 활용률', '열 없음', part.ftaGoods ? '일부 파일(' + esc(part.ftaGoods.join(', ')) + ')에 물자대_FTA 열이 없어 계산하지 않습니다' : '물자대_FTA 열을 골라 주세요', '', kind + '-util'); return; }
      k += kpi(nm + ' FTA 활용률', C.fmtPct(s.util), money(s.ftaGoods) + ' / ' + esc(money(s.goods)), '계산: 물자대_FTA ÷ 물자대', kind + '-util') +
        kpi(nm + ' FTA 절감액', s.hasSaving ? money(s.saving) : '열 없음', !s.hasSaving && part.saving ? '일부 파일(' + esc(part.saving.join(', ')) + ')에 절감액 열이 없어 계산하지 않습니다' : '', s.hasSaving ? '합계' : '', kind + '-saving');
      ch += hbar(nm + ' ' + BYL + '별 FTA 활용률', s.groups.slice(0, 10).map(function (g) { return { label: g.key, value: g.util }; }), function (v) { return C.fmtPct(v); }, COL[i ? 2 : 0]);
      monthly.push({ name: nm + ' 절감액', color: COL[i ? 2 : 0], values: s.monthly.map(function (m) { return m.saving; }), fmt: money });
      tb += '<h3 class="tb-h">' + nm + ' FTA — ' + esc(BYL) + '별 물자대 · 물자대_FTA · 절감액</h3>' + ignoredNote(f.ignored) +
        table([esc(BYL), '물자대', '물자대_FTA', 'FTA 활용률', '절감액'], s.groups.map(function (g) { return { cells: [esc(g.key), n0(g.goods), n0(g.ftaGoods), esc(C.fmtPct(g.util)), n0(g.saving)] }; }),
          ['합계', n0(s.goods), n0(s.ftaGoods), esc(C.fmtPct(s.util)), n0(s.saving)], 'fta-' + kind);
    });
    if (monthly.length) ch = monthChart('월별 FTA 절감액', months, monthly, 'bar') + ch;
    $('kpi-fta').innerHTML = k; $('ch-fta').innerHTML = ch; $('tb-fta').innerHTML = tb;
  }
  function renderRefund() {
    var f = filtered('refund'), k = '', ch = '', tb = '';
    if (!f) { $('kpi-refund').innerHTML = empty('refund'); $('ch-refund').innerHTML = ''; $('tb-refund').innerHTML = ''; return; }
    var s = C.refundStats(f.recs, state.range, f.set.m.map), cntHead = '건수(' + s.countLabel + ')';
    k += kpi('관세환급 합계', money(s.amount), s.count != null ? esc(C.fmtNum(s.count) + '건 · ' + s.countLabel) : '', '합계', 'ref-amount') +
      kpi('월 평균', money(s.monthAvg), '데이터 있는 ' + s.monthsWithData + '개월', '계산: 합계 ÷ 데이터 있는 달 수', 'ref-avg') +
      kpi('최근 달 환급액', s.last ? money(s.last.amount) : '—', s.last ? C.monthLabel(s.last.month) : '', '', 'ref-last');
    ch += monthChart('월별 관세환급액', s.months, [{ name: '환급액', color: COL[1], values: s.monthly.map(function (m) { return m.amount; }), fmt: money }], 'bar');
    ch += hbar('본부별 관세환급액', s.pivot.map(function (p) { return { label: p.hq, value: p.total }; }), money, COL[1]);
    tb += '<h3 class="tb-h">본부별 월별 관세환급 실적</h3>' + ignoredNote(f.ignored) +
      table(['본부'].concat(s.months.map(C.monthLabel), ['합계', esc(cntHead)]), s.pivot.map(function (p) { return { cells: [esc(p.hq)].concat(p.months.map(n0), [n0(p.total), n0(p.count)]) }; }),
        ['합계'].concat(s.monthly.map(function (m) { return n0(m.amount); }), [n0(s.amount), n0(s.count)]), 'refund-pivot');
    $('kpi-refund').innerHTML = k; $('ch-refund').innerHTML = ch; $('tb-refund').innerHTML = tb;
  }
  // (v1.10.0) 오류 비율은 분자 · 분모가 모두 있을 때만 — 그 달 오류점수 자료가 없으면 0% 가 아니라 「자료 없음」(미집계)
  function errRate(v) { return v == null ? '자료 없음' : C.fmtPct(v, 2); }
  function renderErrors() {
    var f = filtered('errors'), k = '', ch = '', tb = '';
    if (!f) { $('kpi-errors').innerHTML = empty('errors'); $('ch-errors').innerHTML = ''; $('tb-errors').innerHTML = ''; return; }
    var s = C.errorStats(f.recs, state.range, 'kind');
    k += kpi('신고건수', C.fmtNum(s.decl), '', '합계', 'err-decl') + kpi('오류건수', C.fmtNum(s.err), '', '합계', 'err-err') +
      kpi('오류 비율', errRate(s.rate), '', '계산: 오류건수 ÷ 신고건수', 'err-rate') + kpi('오류점수', C.fmtNum(s.score), '', '합계', 'err-score');
    var months = C.monthsBetween(state.range.from, state.range.to), byKind = C.valuesOf(f.recs, 'kind');
    var lines = byKind.length > 1 && byKind.length <= 4 ? byKind.map(function (kd, i) {
      var st = C.errorStats(f.recs.filter(function (r) { return r.kind === kd; }), state.range, 'kind');
      return { name: kd, color: COL[i], values: st.monthly.map(function (m) { return m.rate; }), fmt: function (v) { return C.fmtPct(v, 2); } };
    }) : [{ name: '오류 비율', color: COL[4], values: s.monthly.map(function (m) { return m.rate; }), fmt: function (v) { return C.fmtPct(v, 2); } }];
    ch += monthChart('월별 오류 비율', months, lines, 'line', 'pct');
    ch += monthChart('월별 오류건수 · 오류점수', months, [{ name: '오류건수', color: COL[4], values: s.monthly.map(function (m) { return m.err; }), fmt: C.fmtNum }, { name: '오류점수', color: COL[3], values: s.monthly.map(function (m) { return m.score; }), fmt: C.fmtNum }], 'bar', 'count');
    tb += '<h3 class="tb-h">구분별</h3>' + ignoredNote(f.ignored) + table(['구분', '신고건수', '오류건수', '오류 비율', '오류점수'], s.groups.map(function (g) { return { cells: [esc(g.key), n0(g.decl), n0(g.err), esc(errRate(g.rate)), n0(g.score)] }; }),
      ['합계', n0(s.decl), n0(s.err), esc(errRate(s.rate)), n0(s.score)], 'err-kind');
    tb += '<h3 class="tb-h">월별</h3>' + table(['월', '신고건수', '오류건수', '오류 비율', '오류점수'], s.monthly.map(function (m) { return { cells: [esc(C.monthLabel(m.month)), n0(m.decl), n0(m.err), esc(errRate(m.rate)), n0(m.score)] }; }), null, 'err-month');
    $('kpi-errors').innerHTML = k; $('ch-errors').innerHTML = ch; $('tb-errors').innerHTML = tb;
  }
  // (v1.6.0) 연도별 쌓은 막대 + 누계 선. rows = [{year, ...}], stacks = [{key, name, color}], line = {key, name, color}
  function yearChart(title, rows, stacks, line) {
    var W = 640, H = 260, L = 62, R = 12, T = 30, B = 30, iw = W - L - R, ih = H - T - B;
    var max = niceMax(Math.max.apply(null, [0].concat(rows.map(function (r) { return Math.max(r.total || 0, line ? r[line.key] || 0 : 0); }))));
    var fmt = axisFmt('money'), step = iw / Math.max(1, rows.length), y = function (v) { return T + ih - (v / max) * ih; };
    var b = legend(stacks.concat(line ? [line] : []), L);
    for (var g = 0; g <= 4; g++) { var gv = max * g / 4; b += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(gv) + '" y2="' + y(gv) + '" class="grid"/><text x="' + (L - 6) + '" y="' + (y(gv) + 4) + '" class="ax" text-anchor="end">' + esc(fmt(gv)) + '</text>'; }
    var bw = Math.min(56, step * 0.6);
    rows.forEach(function (r, i) {
      var cx = L + step * i + step / 2, top = T + ih;
      b += '<text x="' + cx + '" y="' + (H - 10) + '" class="ax" text-anchor="middle">' + esc(String(r.year)) + '</text>';
      stacks.forEach(function (s) {
        var v = r[s.key]; if (!(v > 0)) return;
        var h = (v / max) * ih; top -= h;
        b += '<rect x="' + (cx - bw / 2).toFixed(1) + '" y="' + top.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" fill="' + s.color + '"><title>' + esc(r.year + '년 ' + s.name + ' ' + money(v)) + '</title></rect>';
      });
    });
    if (line && rows.length) {
      var pts = rows.map(function (r, i) { return [L + step * i + step / 2, y(r[line.key] || 0), r]; });
      b += '<polyline fill="none" stroke="' + line.color + '" stroke-width="2.4" points="' + pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '"/>';
      pts.forEach(function (p) { b += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3.5" fill="' + line.color + '"><title>' + esc(p[2].year + '년까지 ' + line.name + ' ' + money(p[2][line.key])) + '</title></circle>'; });
    }
    if (!rows.length) b += '<text x="' + L + '" y="' + (T + 24) + '" class="ax">데이터 없음</text>';
    return frame(title, '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(title) + '">' + b + '</svg>');
  }
  // (v1.2) 품목분류 결정문 현황 — 관세율은 올린 파일 값을 그대로 보인다(물품설명서 초안에는 여전히 싣지 않는다)
  // (v1.6.0) 금액 열(경정청구 · 유보 · impact)이 있으면 impact 카드 · 연도별 그래프 · 완제품별 절감액 · 진행상태별 · 세율 인하 표를 더한다.
  //          기간은 결정문 탭 전용(state.rrange). 계산 · 기준은 모두 C.rulingStats.
  function renderRuling() {
    var f = filtered('ruling'), k = '', ch = '', tb = '';
    if (!f) { $('kpi-ruling').innerHTML = empty('ruling'); $('ch-ruling').innerHTML = ''; $('tb-ruling').innerHTML = ''; return; }
    var s = C.rulingStats(f.recs, state.rrange || state.range, $('by-ruling').value, $('sort-ruling').value), am = s.amounts;
    var mo = function (v) { return v == null ? '—' : money(v); };
    var cls = function (h, c) { return h.replace('class="kpi"', 'class="kpi ' + c + '"'); };
    var ext = am || s.has.status || s.has.claimDate || s.has.note;
    if (am || s.has.claimDate) {
      var notes = ['<b>기간 기준</b> ' + esc(s.basis)];
      if (s.has.claim) notes.push(s.claimOutsideN ? '<b>경정청구 금액 중 ' + esc(money(s.claimOutside)) + '은 기간 밖 결정문 건</b>(' + s.claimOutsideN + '건)' : '경정청구 금액 중 기간 밖 결정문 건은 없습니다');
      if (s.noDateN) notes.push('경정청구일이 비어 집계에서 뺀 경정청구 금액 ' + s.noDateN + '건 · ' + esc(money(s.noDate)) + '(파일 전체)');
      if (s.impactOnlyN) notes.push('경정청구 · 유보가 비고 impact 값만 있는 ' + s.impactOnlyN + '건 ' + esc(money(s.impactOnly)) + '은 시행일자 기준으로 합계에 넣었습니다');
      if (s.mismatchN) notes.push('impact 값이 경정청구 + 유보와 맞지 않는 ' + s.mismatchN + '건 — 합계는 경정청구 + 유보로 계산하고, 목록에는 impact 칸 값을 보입니다');
      k += '<p class="rul-basis" data-k="rul-basis">' + notes.join(' · ') + '</p>';
    }
    if (am) {
      k += cls(kpi('관세절감 impact 합계', mo(s.impact), '경정청구 ' + esc(mo(s.claim)) + ' + 관세유보 ' + esc(mo(s.reserve)) + (s.impactOnlyN ? ' + impact 값만 있는 ' + s.impactOnlyN + '건 ' + esc(money(s.impactOnly)) : ''), '계산: 경정청구 금액(경정청구일 기준) + 관세유보금액(시행일자 기준)', 'rul-impact'), 'big') +
        kpi('경정청구 환급액', mo(s.claim), s.has.claim ? C.fmtNum(s.claimN) + '건 · 경정청구일 기준' + (s.claimOutsideN ? ' · 그중 ' + esc(money(s.claimOutside)) + '은 기간 밖 결정문 건' : '') : '경정청구 금액 열이 있을 때 보입니다', s.has.claim ? '경정청구일 기준' : '', 'rul-claim') +
        kpi('관세유보액', mo(s.reserve), s.has.reserve ? '시행일자 기준' : '관세유보금액 열이 있을 때 보입니다', s.has.reserve ? '시행일자 기준' : '', 'rul-reserve');
    }
    k += kpi('결정문 건수', C.fmtNum(s.n), '완제품 ' + s.products + '종 · 관세사 ' + s.brokers + '곳', am ? '시행일자 기준' : '합계', 'rul-n');
    if (am || s.has.status) k += kpi('진행중 건수', s.progress == null ? '—' : C.fmtNum(s.progress) + '건', s.progress == null ? '진행상태 열이 있을 때 보입니다' : '경정청구중 + 재심사 + 심판청구', s.progress == null ? '' : '현재 상태 · 기간 무관', 'rul-progress');
    var sub = function (h) { return am ? cls(h, 'small') : h; };
    k += sub(kpi('관세율 0% 결정', C.fmtNum(s.zero) + '건', C.fmtPct(s.zeroRate) + ' (0% 건수 ÷ 결정 건수)' + (s.multiRate ? ' · 복수 세율 ' + s.multiRate + '건 제외' : ''), '계산: 0% 건수 ÷ 결정 건수', 'rul-zero')) +
      sub(kpi('종전보다 낮아진 건', s.withPrev ? C.fmtNum(s.lowered) + '건' : '—', s.withPrev ? '종전세율이 있는 ' + s.withPrev + '건 중' : '종전세율 열이 있을 때 보입니다', s.withPrev ? '계산: 결정세율 < 종전세율' : '', 'rul-lowered')) +
      sub(kpi(am ? '절감 추정(참고)' : '절감 추정(연간)', s.saving == null ? '—' : money(s.saving),
        am ? (s.saving == null ? '금액이 아직 없는 건 중 계산할 수 있는 건이 없습니다' : '금액이 아직 없는 ' + s.savingN + '건만 · 실제 금액과 더하지 않습니다')
          : s.saving == null ? '종전세율 · 연간 수입액 열이 있을 때 계산합니다' : s.savingN + '건 기준 · 추정치', s.saving == null ? '' : '계산: 연간 수입액 × (종전세율 − 결정세율)', 'rul-saving')) +
      sub(kpi('최근 시행', s.latest ? s.latest.date : '—', s.latest ? esc(s.latest.item) : '', '', 'rul-latest'));

    if (am) ch += yearChart('연도별 관세절감 impact(파일 전체 · 경정청구는 경정청구일 연도, 유보는 시행일자 연도)', s.yearly,
      [{ key: 'claim', name: '경정청구', color: COL[0] }, { key: 'reserve', name: '관세유보', color: COL[3] }].concat(s.impactOnlyN || s.yearly.some(function (y) { return y.other; }) ? [{ key: 'other', name: 'impact만', color: COL[4] }] : []),
      { key: 'cum', name: '누계', color: COL[2] });
    ch += monthChart('월별 결정문 시행 건수', s.months, [{ name: '결정 건수', color: COL[2], values: s.monthly.map(function (m) { return m.n || null; }), fmt: C.fmtNum }], 'bar', 'count');
    ch += hbar(s.byLabel + '별 결정 건수', s.groups.filter(function (g) { return g.n; }).slice(0, 12).map(function (g) { return { label: g.key, value: g.n }; }), C.fmtNum, COL[2]);

    var amH = am ? ['경정청구', '관세유보', 'impact'] : [];
    var amC = function (o) { return am ? [esc(mo(o.claim)), esc(mo(o.reserve)), esc(mo(o.impact))] : []; };
    tb += '<h3 class="tb-h">' + esc(s.byLabel) + '별</h3>' + ignoredNote(f.ignored) +
      table([s.byLabel, '결정 건수', '관세율 0%', '0% 비율', am ? '절감 추정(금액 없는 건)' : '절감 추정'].concat(amH), s.groups.map(function (g) { return { cells: [esc(g.key), n0(g.n), n0(g.zero), esc(C.fmtPct(g.zeroRate)), esc(g.saving == null ? '—' : money(g.saving))].concat(amC(g)) }; }),
        ['합계', n0(s.n), n0(s.zero), esc(C.fmtPct(s.zeroRate)), esc(s.saving == null ? '—' : money(s.saving))].concat(amC(s)), 'ruling-by');
    if (am) {
      tb += '<h3 class="tb-h">완제품별 절감액(impact 큰 순)</h3><p class="sub">' + esc(s.basis) + '</p>' +
        table(['완제품', '결정 건수', '경정청구', '관세유보', 'impact'], s.byProduct.map(function (g) { return { cells: [esc(g.key), n0(g.n)].concat(amC(g)) }; }), ['합계', n0(s.n)].concat(amC(s)), 'ruling-product-amt');
      tb += '<h3 class="tb-h">연도별 절감 impact(파일 전체)</h3>' +
        table(['연도', '경정청구(경정청구일 연도)', '관세유보(시행일자 연도)', '합계', '누계'], s.yearly.map(function (y) { return { cells: [esc(String(y.year)), esc(mo(y.claim)), esc(mo(y.reserve)), esc(mo(y.total)), esc(money(y.cum))] }; }), null, 'ruling-year');
    }
    if (s.statuses) tb += '<h3 class="tb-h">진행상태별(현재 상태 · 기간 무관 · 파일 전체)</h3>' +
      table(['진행상태', '건수', '경정청구', '관세유보', 'impact'], s.statuses.map(function (g) { return { cells: [esc(g.key) + (g.progress ? ' <span class="tag bad-t">진행중</span>' : ''), n0(g.n), esc(mo(g.claim)), esc(mo(g.reserve)), esc(mo(g.impact))] }; }), null, 'ruling-status');
    tb += '<h3 class="tb-h">세율별 분포</h3>' + table(['관세율', '건수'], s.rates.map(function (r) { return { cells: [esc(r.key), n0(r.n)] }; }), null, 'ruling-rates');
    if (s.rateChanges.length) tb += '<h3 class="tb-h">세율 인하 분포(종전세율 → 결정세율)</h3>' +
      table(['종전 → 결정', '건수', '낮아짐'], s.rateChanges.map(function (c) { return { cells: [esc(c.key), n0(c.n), c.lowered == null ? '—' : c.lowered ? '예' : '아니오'] }; }), null, 'ruling-change');
    var head = ['시행일자', '완제품', '품명', '결정세번', '결정문번호', '관세율', '관세사'].concat(ext ? ['경정청구', '관세유보', 'impact', '경정청구일', '진행상태'] : []);
    tb += '<h3 class="tb-h">결정문 목록(' + (s.sort === 'impact' ? 'impact 큰 순' : '최근 시행 순') + ')</h3>' + table(head, s.list.map(function (r) {
      var c = [esc(r.date), esc(r.product), esc(r.item), esc(r.hs), esc(r.docNo || ''), esc(r.rateText || '—'), esc(r.broker || '')];
      if (ext) c = c.concat([esc(mo(r.claim)), esc(mo(r.reserve)), esc(mo(r.impactRow)), esc(r.claimDate || '—'), esc(r.status || '—')]);
      return { cls: r.outside ? 'outside' : '', cells: c };
    }), null, 'ruling-list') + (s.claimOutsideN ? '<p class="sub">「기간 밖 결정문」은 시행일자는 기간 밖이지만 경정청구일이 기간 안이라 경정청구 금액이 들어간 건입니다.</p>' : '') +
      '<p class="sub">관세율은 올린 파일의 값을 그대로 보입니다. 물품설명서 초안에는 세율을 싣지 않는 규칙이 그대로입니다.</p>';
    $('kpi-ruling').innerHTML = k; $('ch-ruling').innerHTML = ch; $('tb-ruling').innerHTML = tb;
  }
  var RENDER = { trade: renderTrade, export: renderExport, fta: renderFta, refund: renderRefund, errors: renderErrors, ruling: renderRuling };
  function renderTab() {
    if (!state.range) return;
    document.querySelectorAll('.tab').forEach(function (b) { var on = b.dataset.tab === state.tab; b.setAttribute('aria-selected', on ? 'true' : 'false'); b.classList.toggle('on', on); });
    Object.keys(RENDER).forEach(function (t) { $('t-' + t).hidden = t !== state.tab; });
    RENDER[state.tab]();
  }

  /* ---------- 엑셀 ---------- */
  function exportXlsx() {
    var data = {};
    C.KINDS.forEach(function (k) {
      var s = ready(k); if (!s) return;
      var m = s.m;
      data[k] = { file: m.files.map(function (p) { return p.file; }).join(' + '), period: m.period, records: m.records, map: m.map, skipped: m.skipped,
        files: m.files.map(function (p) { return { file: p.file, uploadedAt: p.uploadedAt, period: p.period, n: p.norm.records.length, skipped: p.norm.skipped.length, excluded: p.excluded, totalRows: p.totalRows }; }) };
    });
    var book = C.exportBook({ range: state.range, rulingRange: state.rrange, filter: state.filter, unit: state.unit, data: data, exportOpts: state.settings });
    var wb = XLSX.utils.book_new();
    book.forEach(function (sh) { XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sh.aoa), sh.name); });
    XLSX.writeFile(wb, '수출입통관_집계_' + state.range.from.replace('-', '') + '-' + state.range.to.replace('-', '') + '.xlsx');
  }

  /* ---------- 이벤트 ---------- */
  var drop = $('d-drop');
  ['dragover', 'dragenter'].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
  drop.addEventListener('drop', function (e) { readFiles(e.dataTransfer.files); });
  $('d-file').addEventListener('change', function () { readFiles(this.files); this.value = ''; });
  $('btn-dash-sample').addEventListener('click', loadSample);
  $('btn-dash-clear').addEventListener('click', function () { localStorage.removeItem(LS.data); localStorage.removeItem(LS.kinds); localStorage.removeItem(LS.files); state.sets = {}; state.pending = []; state.open = {}; state.range = null; state.rrange = null; state.view = false; state.saved = null; state.held = []; state.lostFiles = []; renderSets(); msg('이 브라우저에 기억한 데이터를 지웠습니다.', 'ok'); });
  // (v1.10.0) 조회 모드 띠의 버튼
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-view-keep]')) keepView();
    else if (e.target.closest('[data-view-end]')) endView(false);
    else { var hb = e.target.closest('[data-drop-held]'); if (hb) { state.held.splice(+hb.dataset.dropHeld, 1); renderSets(); } }
  });
  $('d-remember').addEventListener('change', function () { if (this.checked) save(); else localStorage.removeItem(LS.data); });
  $('d-sets').addEventListener('change', function (e) {
    var t = e.target;
    if (t.dataset.map) { var f = state.sets[t.dataset.map].files[+t.dataset.i]; f.override[t.dataset.f] = t.value; state.open[openKey(t.dataset.map, f)] = true; var nt = rebuild(false); if (nt) msg(nt.replace(/^<br>/, ''), 'warn'); }
    else if (t.dataset.pending != null && t.value) {
      var p = state.pending.splice(+t.dataset.pending, 1)[0]; p.reason = '직접 고름';
      var text = putFile(t.value, p), nm = {}; nm[p.file] = 1; state.open[openKey(t.value, p)] = true; setKindPref(p.headers, t.value);
      var note = rebuild(true), ov = overlapNotes(t.value, nm);
      msg(text + (ov.length ? '<br>' + ov.join('<br>') : '') + note, ov.length || note ? 'warn' : 'ok');
    }
    else if (t.dataset.rekind) { if (!changeKind(t.dataset.rekind, +t.dataset.i, t.value)) t.value = t.dataset.rekind; }
  });
  $('d-sets').addEventListener('click', function (e) {
    var t = e.target;
    if (t.dataset.toggle) { var ok = openKey(t.dataset.toggle, state.sets[t.dataset.toggle].files[+t.dataset.i]); state.open[ok] = !state.open[ok]; renderSets(); }
    else if (t.dataset.dropFile) dropFile(t.dataset.dropFile, +t.dataset.i);
    else if (t.dataset.dropPending != null) { state.pending.splice(+t.dataset.dropPending, 1); renderSets(); }
  });
  $('f-from').addEventListener('change', function () { var r = curRange(); r.from = this.value; if (r.to < this.value) r.to = this.value; renderFilter(); renderTab(); });
  $('f-to').addEventListener('change', function () { var r = curRange(); r.to = this.value; if (r.from > this.value) r.from = this.value; renderFilter(); renderTab(); });
  $('f-hq').addEventListener('change', function () { state.filter.hq = this.value; renderTab(); });
  $('f-country').addEventListener('change', function () { state.filter.country = this.value; renderTab(); });
  $('f-unit').addEventListener('change', function () { state.unit = this.value; localStorage.setItem(LS.unit, this.value); renderFilter(); renderTab(); });
  $('btn-f-reset').addEventListener('click', function () { state.range = C.defaultRange(state.period); state.rrange = C.rulingDefaultRange(state.rperiod); state.filter = {}; renderFilter(); renderTab(); });
  $('btn-dash-xlsx').addEventListener('click', exportXlsx);
  document.querySelector('.tabs').addEventListener('click', function (e) { var b = e.target.closest('.tab'); if (b) { state.tab = b.dataset.tab; if (state.tab === 'fta') showTariffMeta(); renderFilter(); renderTab(); } });
  ['by-trade', 'top-trade', 'by-export', 'top-export', 'by-fta', 'by-ruling', 'sort-ruling'].forEach(function (id) { $(id).addEventListener('change', renderTab); });
  // (v1.7.0) 설정
  $('d-settings-body').addEventListener('change', function (e) {
    var t = e.target;
    if (t.id === 'set-gn') applySettings(settingsFromForm(), '결제방법 ' + C.EXPORT_EXCLUDE_PAYMENT + ' 줄 ' + (t.checked ? '빼기를 켰습니다.' : '빼기를 껐습니다(GN 포함).'));
    else if (t.dataset.set) applySettings(settingsFromForm(), 'Plant → 본부 표를 고쳤습니다.');
  });
  $('d-settings-body').addEventListener('click', function (e) {
    var t = e.target;
    if (t.dataset.setDel != null) applySettings(settingsFromForm({ del: +t.dataset.setDel }), 'Plant 번호 한 줄을 뺐습니다.');
    else if (t.dataset.setAdd != null) {
      var c = document.querySelector('[data-set-new="code"]').value.trim(), h = document.querySelector('[data-set-new="hq"]').value.trim();
      if (!c || !h) { msg('새 Plant 번호와 본부 이름을 모두 적어 주세요.', 'warn'); return; }
      applySettings(settingsFromForm({ add: { code: c, hq: h } }), 'Plant ' + esc(c) + ' → ' + esc(h) + ' 을(를) 더했습니다.');
    } else if (t.dataset.setReset != null) {
      try { localStorage.removeItem(LS.settings); } catch (er) { /* 지우지 못해도 화면은 기본 표 */ }
      state.settings = C.exportSettings(null); renderSettings();
      var note = Object.keys(state.sets).length ? rebuild(false) : '';
      msg('Plant 표와 GN 제외를 기본값으로 되돌렸습니다.' + note, note ? 'warn' : 'ok');
    }
  });
  renderSettings();

  if (location.hash === '#example') loadSample();
  else if (restore()) { var rn = rebuild(true); msg('이 브라우저에 기억한 데이터를 불러왔습니다. 오늘 엑셀을 올리면 같은 종류 파일에 더합니다(이름이 같은 파일은 바꿉니다).' + rn, rn ? 'warn' : 'note'); }
})();
