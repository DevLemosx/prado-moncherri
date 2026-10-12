/**
 * pix.js
 * Pix "copia e cola" (BR Code estático, padrão do Banco Central) e validação da chave.
 * Funções puras: recebem dados, devolvem texto. Não mexem em DOM nem em rede.
 *
 * O código é uma sequência de campos "ID + tamanho + valor" terminada por um
 * CRC16. Qualquer byte errado e o app do banco recusa o código — por isso a
 * parte matemática está isolada aqui e coberta por testes.
 *
 * O código gerado já leva o VALOR do pedido; o cliente só cola no app do banco.
 */

window.PM = window.PM || {};

PM.Pix = (function () {
  var KEY_TYPES = [
    { id: "cpf", label: "CPF" },
    { id: "cnpj", label: "CNPJ" },
    { id: "phone", label: "Celular" },
    { id: "email", label: "E-mail" },
    { id: "random", label: "Chave aleatória" }
  ];

  /** CRC-16/CCITT-FALSE (poly 0x1021, início 0xFFFF), em 4 letras hexadecimais maiúsculas. */
  function crc16(str) {
    var crc = 0xffff;
    for (var i = 0; i < str.length; i++) {
      crc ^= str.charCodeAt(i) << 8;
      for (var b = 0; b < 8; b++) {
        crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
      }
    }
    return ("0000" + crc.toString(16).toUpperCase()).slice(-4);
  }

  /** Um campo do BR Code: ID (2 dígitos) + tamanho (2 dígitos) + valor. */
  function field(id, value) {
    var len = String(value.length);
    if (len.length < 2) len = "0" + len;
    return id + len + value;
  }

  /** Nome/cidade do recebedor: MAIÚSCULAS, sem acento, só letras/números/espaço, no limite do padrão. */
  function clean(text, max) {
    var t = String(text == null ? "" : text)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9 ]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return t.slice(0, max).trim();
  }

  /**
   * @param {{key:string, name:string, city:string, amount:number}} o
   * @returns {string} código "copia e cola"
   */
  function payload(o) {
    var key = String(o.key || "");
    if (!key || key.length > 77) throw new Error("Chave Pix inválida.");
    var amount = Number(o.amount);

    var body =
      field("00", "01") + // versão do formato
      field("01", "11") + // QR estático
      field("26", field("00", "br.gov.bcb.pix") + field("01", key)) + // conta Pix + chave
      field("52", "0000") + // categoria (não informada)
      field("53", "986") + // moeda: real
      (amount > 0 ? field("54", amount.toFixed(2)) : "") + // valor
      field("58", "BR") +
      field("59", clean(o.name, 25) || "RECEBEDOR") +
      field("60", clean(o.city, 15) || "BRASIL") +
      field("62", field("05", "***")) + // identificador do pagamento: "***" = não informado
      "6304"; // o CRC16 é calculado sobre tudo, inclusive "6304"
    return body + crc16(body);
  }

  // ---------------- Validação da chave ----------------
  function allSame(digits) {
    return /^(\d)\1+$/.test(digits);
  }

  function isValidCpf(cpf) {
    if (!/^\d{11}$/.test(cpf) || allSame(cpf)) return false;
    for (var t = 9; t < 11; t++) {
      var sum = 0;
      for (var i = 0; i < t; i++) sum += Number(cpf[i]) * (t + 1 - i);
      var digit = ((sum * 10) % 11) % 10;
      if (digit !== Number(cpf[t])) return false;
    }
    return true;
  }

  function isValidCnpj(cnpj) {
    if (!/^\d{14}$/.test(cnpj) || allSame(cnpj)) return false;
    var calc = function (len) {
      var weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      var sum = 0;
      for (var i = 0; i < len; i++) sum += Number(cnpj[i]) * weights[i];
      var r = sum % 11;
      return r < 2 ? 0 : 11 - r;
    };
    return calc(12) === Number(cnpj[12]) && calc(13) === Number(cnpj[13]);
  }

  /**
   * Confere e padroniza o que a dona digitou como chave.
   * @returns {{key:string}|{error:string}}
   */
  function normalizeKey(type, raw) {
    var text = String(raw == null ? "" : raw).trim();
    var digits = text.replace(/\D/g, "");

    if (type === "cpf") {
      return isValidCpf(digits) ? { key: digits } : { error: "CPF inválido. Confira os números." };
    }
    if (type === "cnpj") {
      return isValidCnpj(digits) ? { key: digits } : { error: "CNPJ inválido. Confira os números." };
    }
    if (type === "phone") {
      var national = digits;
      if ((digits.length === 12 || digits.length === 13) && digits.indexOf("55") === 0) national = digits.slice(2);
      if (national.length !== 10 && national.length !== 11) {
        return { error: "Celular inválido. Digite o DDD e o número (ex: 91 98605-6549)." };
      }
      if (national.charAt(0) === "0") return { error: "Celular inválido: o DDD não pode começar com 0." };
      return { key: "+55" + national };
    }
    if (type === "email") {
      var email = text.toLowerCase();
      if (!/^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/.test(email) || email.length > 77) {
        return { error: "E-mail inválido." };
      }
      return { key: email };
    }
    if (type === "random") {
      var uuid = text.toLowerCase();
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(uuid)
        ? { key: uuid }
        : { error: "Chave aleatória inválida. Ela tem o formato xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx." };
    }
    return { error: "Escolha o tipo da chave." };
  }

  function keyTypeLabel(id) {
    for (var i = 0; i < KEY_TYPES.length; i++) if (KEY_TYPES[i].id === id) return KEY_TYPES[i].label;
    return "Chave Pix";
  }

  return {
    KEY_TYPES: KEY_TYPES,
    crc16: crc16,
    clean: clean,
    payload: payload,
    isValidCpf: isValidCpf,
    isValidCnpj: isValidCnpj,
    normalizeKey: normalizeKey,
    keyTypeLabel: keyTypeLabel
  };
})();
