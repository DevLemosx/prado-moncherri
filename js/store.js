/**
 * store.js
 * Regras da loja que o site e o painel compartilham. Tudo aqui é função pura
 * (recebe dados, devolve resultado; não mexe em DOM nem em rede), então dá
 * pra testar com horários exatos.
 *
 * IMPORTANTE — fuso horário: "hoje é sábado" e "estamos abertos" valem pro
 * relógio de BELÉM (onde fica a loja), não pro relógio do aparelho do
 * cliente. Senão alguém com o celular em outro fuso veria o especial de
 * sábado ligado/desligado na hora errada.
 */

window.PM = window.PM || {};

PM.Store = (function () {
  var TZ = "America/Belem";
  var DAY_FULL = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
  var DAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  var WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]; // exibição: segunda → domingo
  var WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  // Valores usados enquanto nada foi salvo no painel (ou se a busca falhar).
  var DEFAULTS = {
    delivery_fee: 8,
    special_sunday_date: null,
    pix: null, // { key, key_type, name, city } — configurado no painel; sem isso o Pix funciona "combinando pelo WhatsApp"
    opening_hours: {
      0: { open: "08:00", close: "16:00", closed: false },
      1: { open: "08:00", close: "22:00", closed: false },
      2: { open: "08:00", close: "22:00", closed: false },
      3: { open: "08:00", close: "19:00", closed: false },
      4: { open: "08:00", close: "22:00", closed: false },
      5: { open: "08:00", close: "19:00", closed: false },
      6: { open: "08:00", close: "22:00", closed: false }
    }
  };

  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function round2(x) { return Math.round(x * 100) / 100; }

  /** Escapa texto digitado no painel (nome de sabor, descrição...) antes de colocar em innerHTML. */
  function escapeHtml(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function formatBRL(value) {
    return "R$ " + Number(value).toFixed(2).replace(".", ",");
  }

  /** "08:00" -> 480 (minutos desde 00:00). Devolve NaN se não for HH:MM válido. */
  function parseTime(str) {
    var m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(str));
    return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
  }

  /**
   * Interpreta um valor digitado em reais: "50", "50,00", "R$ 50,5", "1.250,00", "50.5".
   * Devolve NaN se for inválido (vazio, texto, negativo, mais de 2 casas decimais).
   */
  function parseMoney(input) {
    var s = String(input == null ? "" : input).replace(/R\$/gi, "").replace(/\s/g, "");
    if (s === "") return NaN;
    if (s.indexOf(",") !== -1) s = s.replace(/\./g, "").replace(",", ".");
    if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN;
    return round2(Number(s));
  }

  // ---------------- Horário de Belém ----------------

  /** Plano B se o navegador não suportar fusos no Intl: Belém é UTC-3 o ano todo (sem horário de verão desde 2019). */
  function fixedOffsetParts(date) {
    var t = new Date(date.getTime() - 3 * 3600 * 1000);
    return {
      dow: t.getUTCDay(),
      minutes: t.getUTCHours() * 60 + t.getUTCMinutes(),
      dateKey: t.getUTCFullYear() + "-" + pad(t.getUTCMonth() + 1) + "-" + pad(t.getUTCDate())
    };
  }

  /** Dia da semana (0=domingo), minutos desde 00:00 e data "AAAA-MM-DD" no horário de Belém. */
  function belemParts(date) {
    try {
      var parts = new Intl.DateTimeFormat("en-US", {
        timeZone: TZ, hourCycle: "h23", weekday: "short",
        year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
      }).formatToParts(date);
      var m = {};
      parts.forEach(function (p) { m[p.type] = p.value; });
      var dow = WEEKDAY_INDEX[m.weekday];
      var hour = Number(m.hour) % 24; // alguns motores devolvem "24" à meia-noite
      var minute = Number(m.minute);
      if (dow === undefined || isNaN(hour) || isNaN(minute)) throw new Error("data inválida");
      return { dow: dow, minutes: hour * 60 + minute, dateKey: m.year + "-" + m.month + "-" + m.day };
    } catch (e) {
      return fixedOffsetParts(date);
    }
  }

  /** Soma dias a uma data "AAAA-MM-DD" (aritmética de calendário, sem fuso). */
  function addDays(dateKey, n) {
    var p = dateKey.split("-");
    var t = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]) + n));
    return t.getUTCFullYear() + "-" + pad(t.getUTCMonth() + 1) + "-" + pad(t.getUTCDate());
  }

  /** "2026-10-11" -> "11/10" */
  function formatDayMonth(dateKey) {
    var p = dateKey.split("-");
    return p[2] + "/" + p[1];
  }

  // ---------------- Configurações ----------------

  function cloneDay(d) { return { open: d.open, close: d.close, closed: !!d.closed }; }

  function validDay(d) {
    if (!d || typeof d !== "object") return false;
    if (d.closed === true) return true;
    var o = parseTime(d.open), c = parseTime(d.close);
    return !isNaN(o) && !isNaN(c) && o < c;
  }

  /**
   * Recebe { chave: valor } (como vem da tabela settings) e devolve configurações
   * sempre completas e válidas: o que estiver faltando ou estragado volta ao padrão.
   */
  function normalizeSettings(raw) {
    raw = raw || {};
    var out = { delivery_fee: DEFAULTS.delivery_fee, special_sunday_date: null, pix: null, opening_hours: {} };

    if (typeof raw.delivery_fee === "number" && isFinite(raw.delivery_fee) && raw.delivery_fee >= 0 && raw.delivery_fee <= 500) {
      out.delivery_fee = round2(raw.delivery_fee);
    }

    if (typeof raw.special_sunday_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.special_sunday_date)) {
      out.special_sunday_date = raw.special_sunday_date;
    }

    var p = raw.pix;
    if (p && typeof p === "object" && typeof p.key === "string" && p.key.trim() && p.key.length <= 77) {
      out.pix = {
        key: p.key.trim(),
        key_type: typeof p.key_type === "string" ? p.key_type : "",
        name: typeof p.name === "string" ? p.name : "",
        city: typeof p.city === "string" ? p.city : ""
      };
    }

    var hours = raw.opening_hours && typeof raw.opening_hours === "object" ? raw.opening_hours : {};
    for (var d = 0; d < 7; d++) {
      var src = hours[d];
      if (validDay(src)) {
        var def = DEFAULTS.opening_hours[d];
        out.opening_hours[d] = src.closed === true
          ? { open: validDay({ open: src.open, close: src.close }) ? src.open : def.open,
              close: validDay({ open: src.open, close: src.close }) ? src.close : def.close,
              closed: true }
          : { open: src.open, close: src.close, closed: false };
      } else {
        out.opening_hours[d] = cloneDay(DEFAULTS.opening_hours[d]);
      }
    }
    return out;
  }

  // ---------------- Aberto / fechado ----------------

  /**
   * @returns {{open:boolean, closesAt:?string, nextOpen:?{dayOffset:number, dow:number, time:string}}}
   * O horário de fechamento é exclusivo: às 22:00 em ponto já está fechado.
   */
  function openStatus(hours, date) {
    var now = belemParts(date);
    var today = hours[now.dow];
    if (!today.closed) {
      var o = parseTime(today.open), c = parseTime(today.close);
      if (now.minutes >= o && now.minutes < c) return { open: true, closesAt: today.close, nextOpen: null };
      if (now.minutes < o) return { open: false, closesAt: null, nextOpen: { dayOffset: 0, dow: now.dow, time: today.open } };
    }
    for (var i = 1; i <= 7; i++) {
      var dow = (now.dow + i) % 7;
      if (!hours[dow].closed) return { open: false, closesAt: null, nextOpen: { dayOffset: i, dow: dow, time: hours[dow].open } };
    }
    return { open: false, closesAt: null, nextOpen: null };
  }

  /** "amanhã às 08:00", "hoje às 08:00", "segunda-feira às 08:00" */
  function nextOpenPhrase(n) {
    var when = n.dayOffset === 0 ? "hoje" : n.dayOffset === 1 ? "amanhã" : DAY_FULL[n.dow];
    return when + " às " + n.time;
  }

  function statusText(st) {
    if (st.open) return "Aberto agora · fecha às " + st.closesAt;
    if (!st.nextOpen) return "Fechado";
    return "Fechado · abre " + nextOpenPhrase(st.nextOpen);
  }

  function joinList(items) {
    if (items.length <= 1) return items.join("");
    return items.slice(0, -1).join(", ") + " e " + items[items.length - 1];
  }

  /** Agrupa dias com o mesmo horário: [{label:"Seg, ter, qui e sáb", text:"08:00 – 22:00"}, ...] */
  function groupHours(hours) {
    var groups = [], index = {};
    WEEK_ORDER.forEach(function (d) {
      var h = hours[d];
      var key = h.closed ? "closed" : h.open + "-" + h.close;
      if (!index[key]) {
        index[key] = { days: [], text: h.closed ? "Fechado" : h.open + " – " + h.close };
        groups.push(index[key]);
      }
      index[key].days.push(d);
    });
    return groups.map(function (g) {
      var label;
      if (g.days.length === 7) label = "Todos os dias";
      else if (g.days.length === 1) label = DAY_FULL[g.days[0]].charAt(0).toUpperCase() + DAY_FULL[g.days[0]].slice(1);
      else label = joinList(g.days.map(function (d, i) { return i === 0 ? DAY_SHORT[d] : DAY_SHORT[d].toLowerCase(); }));
      return { label: label, text: g.text };
    });
  }

  // ---------------- Especial de fatias ----------------

  /** Aberto aos sábados sempre; aos domingos só se a dona liberou ESSE domingo (a data expira sozinha). */
  function isSpecialOpen(settings, date) {
    var p = belemParts(date);
    if (p.dow === 6) return true;
    return p.dow === 0 && !!settings.special_sunday_date && settings.special_sunday_date === p.dateKey;
  }

  /** Data ("AAAA-MM-DD") do domingo de hoje (se hoje for domingo) ou do próximo. */
  function upcomingSunday(date) {
    var p = belemParts(date);
    return addDays(p.dateKey, (7 - p.dow) % 7);
  }

  return {
    DEFAULTS: DEFAULTS,
    DAY_FULL: DAY_FULL,
    DAY_SHORT: DAY_SHORT,
    WEEK_ORDER: WEEK_ORDER,
    formatBRL: formatBRL,
    escapeHtml: escapeHtml,
    round2: round2,
    parseTime: parseTime,
    parseMoney: parseMoney,
    belemParts: belemParts,
    fixedOffsetParts: fixedOffsetParts,
    addDays: addDays,
    formatDayMonth: formatDayMonth,
    normalizeSettings: normalizeSettings,
    openStatus: openStatus,
    nextOpenPhrase: nextOpenPhrase,
    statusText: statusText,
    groupHours: groupHours,
    isSpecialOpen: isSpecialOpen,
    upcomingSunday: upcomingSunday
  };
})();

PM.formatBRL = PM.Store.formatBRL;
