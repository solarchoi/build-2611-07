/* 수출입통관 업무 대시보드 — 관세율표 조회 (v1.9.1)
 *
 * data/tariff-ac.json  (기준세율 — A · C)     tools/build-tariff.mjs 가 관세청 관세율표 엑셀에서 만든다.
 * data/tariff-fta.json (협정세율 — FCN1 · FEU1 …)
 *
 * 지키는 것
 *   - 첫 화면에서 받지 않는다. 세율이 처음 필요해질 때 loadTariff() 가 한 번만 받고(Promise 캐시) 다음부터는 그대로 쓴다.
 *   - localStorage 에 넣지 않는다(용량 한도를 넘긴다). 메모리에 객체로 한 번만 두고, 조회는 rates[hs][구분] 해시 조회뿐이다.
 *   - HS 는 숫자만 남겨 10자리일 때만 찾는다. 앞에 0을 붙이거나 뒤를 자르지 않는다.
 *   - 없는 세율은 null 이다(0 으로 바꾸지 않는다). 세율 0 은 0 그대로.
 *   - 기준세율(baseRate, 관세율표) 과 실제 적용세율(ERP 자료의 값)은 다른 값이다. 이 파일은 관세율표만 다룬다.
 *   - 받기에 실패하면 { ok:false } 로 끝나고 조회는 모두 null — 다른 집계는 막지 않는다.
 * 브라우저(window.Tariff)와 node(require) 양쪽에서 읽힌다.
 */
(function (root) {
  'use strict';
  var FILES = { ac: 'data/tariff-ac.json', fta: 'data/tariff-fta.json' };
  var FAIL_TEXT = '관세율표를 불러오지 못했습니다';
  var ac = null, fta = null, meta = null, pending = null;

  // 기본 받기: 브라우저 fetch. 시험에서는 setFetcher 로 바꾼다.
  var fetcher = function (url) {
    return fetch(url).then(function (r) { if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); });
  };

  function valid(j) { return !!(j && j.meta && j.rates && typeof j.rates === 'object'); }

  function loadTariff() {
    if (pending) return pending;
    pending = Promise.all([fetcher(FILES.ac), fetcher(FILES.fta)]).then(function (got) {
      if (!valid(got[0]) || !valid(got[1])) throw new Error('관세율표 모양이 다릅니다');
      ac = got[0].rates; fta = got[1].rates;
      meta = { year: got[0].meta.year, source: got[0].meta.source, hsCount: got[0].meta.hsCount };
      return { ok: true, meta: tariffMeta() };
    }).catch(function (e) {
      ac = fta = meta = null;
      return { ok: false, error: FAIL_TEXT, detail: String(e && e.message || e) };
    });
    return pending;
  }

  // 숫자만 남겨 10자리면 그 문자열, 아니면 null.
  function normHs(v) {
    if (v == null) return null;
    var d = String(v).replace(/\D/g, '');
    return d.length === 10 ? d : null;
  }

  function own(o, k) { return o != null && Object.prototype.hasOwnProperty.call(o, k); }
  function num(v) { return typeof v === 'number' && isFinite(v) ? v : null; }

  // 기준세율: A 가 있으면 A, 없으면 C, 둘 다 없으면 null.
  function baseRate(hs) {
    var h = normHs(hs);
    if (!h || !ac || !own(ac, h)) return null;
    var r = ac[h], a = own(r, 'A') ? num(r.A) : null;
    if (a != null) return a;
    return own(r, 'C') ? num(r.C) : null;
  }

  // 협정세율: 구분(Duty Type)을 대문자로 바꿔 그 HS 의 세율. 없으면 null.
  function ftaRate(hs, dutyType) {
    var h = normHs(hs), t = dutyType == null ? '' : String(dutyType).trim().toUpperCase();
    if (!h || !t || !fta || !own(fta, h)) return null;
    return own(fta[h], t) ? num(fta[h][t]) : null;
  }

  // 화면 표기용 { year, source, hsCount } — 받기 전 · 실패면 null.
  function tariffMeta() { return meta ? { year: meta.year, source: meta.source, hsCount: meta.hsCount } : null; }

  // 「관세율표 2026년 기준 · HS 11,326종」
  function tariffMetaText(m) {
    m = m || tariffMeta();
    if (!m) return null;
    return '관세율표 ' + m.year + '년 기준 · HS ' + Number(m.hsCount).toLocaleString('en-US') + '종';
  }

  // 시험용: 받는 함수를 바꾸고 캐시를 비운다.
  function setFetcher(fn) { fetcher = fn; reset(); }
  function reset() { ac = fta = meta = pending = null; }

  var api = {
    FILES: FILES, FAIL_TEXT: FAIL_TEXT,
    loadTariff: loadTariff, normHs: normHs, baseRate: baseRate, ftaRate: ftaRate,
    tariffMeta: tariffMeta, tariffMetaText: tariffMetaText,
    setFetcher: setFetcher, reset: reset
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Tariff = api;
})(this);
