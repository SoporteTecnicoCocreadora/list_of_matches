/**
 * Lógica de cruce de listas (sin dependencias, funciona en el navegador y en Node).
 *
 * Compara las personas de la Lista 1 (base) con las de la Lista 2 usando el correo y el
 * nombre, y clasifica cada pareja en:
 *   - "total":   coinciden el correo (exacto, o compatible si viene oculto con *) Y el nombre.
 *   - "correo":  coincide el correo pero el nombre no.
 *   - "nombre":  coincide el nombre pero el correo no se pudo confirmar (distinto, vacío o solo
 *                se parece el inicio).
 *   - sin coincidencia: no coincide ni el correo ni el nombre.
 * "El nombre coincide" = al menos dos palabras en común (p. ej. nombre y apellido), o el mismo
 * nombre de una sola palabra. Una sola palabra suelta (solo "Carlos") no cuenta: es muy común.
 *
 * Correos ocultos (como los exporta Google Meet): "fr.g*************@***.com".
 *   - En la parte local cada * es UNA letra: el largo del correo se conserva.
 *   - En el dominio los * son un bloque de largo fijo: solo cuenta lo visible (".com", ".co").
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Matcher = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const STOPWORDS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'da', 'do', 'dos', 'van', 'von']);

  function stripAccents(value) {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');
  }

  /** Palabras de un nombre, sin tildes ni signos, en minúscula y sin conectores. */
  function nameTokens(value) {
    return stripAccents(value)
      .toLowerCase()
      .replace(/[^a-zñ0-9]+/g, ' ')
      .split(' ')
      .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
  }

  function escapeRegex(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /** Correo normalizado, o null si no parece un correo. */
  function parseEmail(value) {
    const raw = String(value ?? '').trim().toLowerCase();
    const at = raw.lastIndexOf('@');
    if (at < 1 || at === raw.length - 1 || /\s/.test(raw)) return null;
    const local = raw.slice(0, at);
    const domain = raw.slice(at + 1);
    const masked = raw.includes('*');
    if (!masked && !domain.includes('.')) return null;
    return {
      raw,
      local,
      domain,
      masked,
      // Lo visible al inicio de un correo oculto: "fr.g*****" -> "fr.g"
      prefix: masked ? local.split('*')[0] : local,
    };
  }

  /** ¿El correo oculto `masked` puede ser el correo completo `plain`? */
  function maskFits(masked, plain) {
    const localRe = new RegExp('^' + masked.local.split('').map((c) => (c === '*' ? '.' : escapeRegex(c))).join('') + '$');
    const domainRe = new RegExp(
      '^' + masked.domain.split(/\*+/).map(escapeRegex).join('.+') + '$'
    );
    return localRe.test(plain.local) && domainRe.test(plain.domain);
  }

  /**
   * Relación entre dos correos:
   *   'exacto' | 'compatible' | 'prefijo' (solo coincide el inicio visible) | 'distinto' | null (falta alguno)
   */
  function compareEmails(a, b) {
    if (!a || !b) return null;
    if (!a.masked && !b.masked) return a.raw === b.raw ? 'exacto' : 'distinto';
    if (a.masked && b.masked) return a.raw === b.raw ? 'compatible' : 'distinto';
    const [masked, plain] = a.masked ? [a, b] : [b, a];
    if (maskFits(masked, plain)) return 'compatible';
    if (masked.prefix.length >= 3 && plain.local.startsWith(masked.prefix)) return 'prefijo';
    return 'distinto';
  }

  function levenshtein(a, b) {
    if (a === b) return 0;
    const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let diag = prev[0];
      prev[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const tmp = prev[j];
        prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
        diag = tmp;
      }
    }
    return prev[b.length];
  }

  /** Parecido entre dos palabras (0 a 1). Tolera errores de digitación y abreviaturas. */
  function tokenSimilarity(a, b) {
    if (a === b) return 1;
    if (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a))) return 0.9;
    return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
  }

  const TOKEN_THRESHOLD = 0.8;

  /**
   * Compara dos nombres palabra por palabra (sin importar el orden).
   * matched: cuántas palabras del nombre más corto encontraron pareja.
   */
  function compareNames(tokensA, tokensB) {
    if (!tokensA.length || !tokensB.length) return { matched: 0, score: 0, strong: false };
    const [short, long] = tokensA.length <= tokensB.length ? [tokensA, tokensB] : [tokensB, tokensA];
    const used = new Set();
    let matched = 0;
    let sum = 0;
    for (const token of short) {
      let best = 0;
      let bestIndex = -1;
      long.forEach((other, i) => {
        if (used.has(i)) return;
        const sim = tokenSimilarity(token, other);
        if (sim > best) {
          best = sim;
          bestIndex = i;
        }
      });
      if (best >= TOKEN_THRESHOLD) {
        used.add(bestIndex);
        matched++;
        sum += best;
      }
    }
    // Fuerte: al menos dos palabras (nombre + apellido), o nombres de una sola palabra idénticos
    const strong = matched >= 2 || (short.length === 1 && long.length === 1 && matched === 1);
    return { matched, score: sum / short.length, strong };
  }

  const EMAIL_LABEL = {
    exacto: 'correo idéntico',
    compatible: 'correo compatible',
    prefijo: 'solo coincide el inicio del correo',
    distinto: 'correo distinto',
  };

  /**
   * Clasifica una pareja. mode: 'ambos' (correo y nombre) | 'correo' | 'nombre'.
   * Devuelve null si no hay coincidencia.
   */
  function classifyPair(a, b, mode = 'ambos') {
    const email = mode === 'nombre' ? null : compareEmails(a.email, b.email);
    const name = mode === 'correo' ? { matched: 0, score: 0, strong: false } : compareNames(a.tokens, b.tokens);
    const emailOk = email === 'exacto' || email === 'compatible';

    let type = null;
    if (mode === 'correo') {
      if (emailOk) type = 'total';
      else if (email === 'prefijo') type = 'correo';
    } else if (mode === 'nombre') {
      if (name.strong) type = 'total';
      else if (name.matched >= 1 && name.score >= 0.9 && a.tokens.length > 1 && b.tokens.length > 1) type = 'nombre';
    } else if (emailOk && name.strong) {
      // Coincidencia al 100%: el correo Y el nombre coinciden
      type = 'total';
    } else if (emailOk) {
      type = 'correo';
    } else if (name.strong) {
      type = 'nombre';
    }
    if (!type) return null;

    const reasons = [];
    if (email && email !== 'distinto') reasons.push(EMAIL_LABEL[email]);
    if (mode !== 'correo') {
      if (name.matched) reasons.push(`${name.matched} palabra${name.matched > 1 ? 's' : ''} del nombre en común`);
      else reasons.push('el nombre no se parece');
    }
    if (email === 'distinto' && type !== 'total') reasons.push(EMAIL_LABEL.distinto);
    if (email === null && mode !== 'nombre' && (a.email || b.email)) reasons.push('a uno de los dos le falta el correo');

    const base = { total: 1000, correo: 600, nombre: 500 }[type];
    const score = base + (email === 'exacto' ? 100 : 0) + (emailOk ? 50 : 0) + (email === 'prefijo' ? 20 : 0) + Math.round(name.score * 100);
    return { type, score, email, name, reason: reasons.join(' · ') };
  }

  /** Prepara una fila: nombre (uniendo varias columnas) y correo. */
  function buildPerson(row, index, nameColumns, emailColumn) {
    const name = nameColumns
      .map((c) => String(row[c] ?? '').trim())
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .replace(/[,;]+$/, '');
    const rawEmail = emailColumn == null ? '' : String(row[emailColumn] ?? '').trim();
    return { index, name, rawEmail, tokens: nameTokens(name), email: parseEmail(rawEmail) };
  }

  /**
   * Cruza las dos listas. Cada persona queda emparejada como máximo una vez: primero las
   * parejas más seguras (de mayor puntaje).
   * listA/listB: { rows: Array<Array>, nameColumns: number[], emailColumn: number|null }
   */
  function matchLists(listA, listB, mode = 'ambos') {
    const people = (list) =>
      list.rows
        .map((row, i) => buildPerson(row, i, list.nameColumns, list.emailColumn))
        .filter((p) => p.name || p.rawEmail);
    const A = people(listA);
    const B = people(listB);

    const candidates = [];
    for (const a of A) {
      for (const b of B) {
        const result = classifyPair(a, b, mode);
        if (result) candidates.push({ a, b, ...result });
      }
    }
    candidates.sort((x, y) => y.score - x.score);

    const usedA = new Set();
    const usedB = new Set();
    const pairs = [];
    for (const c of candidates) {
      if (usedA.has(c.a.index) || usedB.has(c.b.index)) continue;
      usedA.add(c.a.index);
      usedB.add(c.b.index);
      pairs.push(c);
    }
    pairs.sort((x, y) => x.a.index - y.a.index);

    return {
      total: pairs.filter((p) => p.type === 'total'),
      parcial: pairs.filter((p) => p.type !== 'total'),
      sinCoincidenciaA: A.filter((a) => !usedA.has(a.index)),
      sinCoincidenciaB: B.filter((b) => !usedB.has(b.index)),
      pairs,
    };
  }

  // ---- Detección automática de encabezado y columnas ----

  const HEADER_HINT = /nombre|name|apellido|correo|e-?mail|mail|usuario|documento|c[eé]dula|tel[eé]fono|celular/i;

  /** Fila (0-based) que parece ser el encabezado, buscando en las primeras 15. */
  function detectHeaderRow(rows) {
    let best = -1;
    let bestScore = -1;
    rows.slice(0, 15).forEach((row, i) => {
      const cells = row.map((c) => String(c ?? '').trim()).filter(Boolean);
      const hits = cells.filter((c) => HEADER_HINT.test(c)).length;
      const score = hits * 10 + cells.length;
      if (hits > 0 && score > bestScore) {
        best = i;
        bestScore = score;
      }
    });
    if (best >= 0) return best;
    const firstFilled = rows.findIndex((r) => r.some((c) => String(c ?? '').trim()));
    return Math.max(firstFilled, 0);
  }

  /** Sugiere columnas de nombre (varias, p. ej. Nombre + Apellido) y de correo. */
  function guessColumns(headers) {
    const labels = headers.map((h) => stripAccents(h).toLowerCase().trim());
    const emailColumn = labels.findIndex((h) => /correo|e-?mail|\bmail\b/.test(h));
    let nameColumns = labels
      .map((h, i) => (/(^|\s)(nombres?|name|apellidos?|last name|first name|nombre completo|full name)(\s|$)/.test(h) && !/usuario|user|empresa|equipo|archivo/.test(h) ? i : -1))
      .filter((i) => i >= 0);
    if (!nameColumns.length) {
      const fallback = labels.findIndex((h) => /nombre|name/.test(h));
      if (fallback >= 0) nameColumns = [fallback];
    }
    return { nameColumns, emailColumn: emailColumn >= 0 ? emailColumn : null };
  }

  return {
    nameTokens,
    parseEmail,
    compareEmails,
    compareNames,
    classifyPair,
    matchLists,
    detectHeaderRow,
    guessColumns,
  };
});
