/**
 * whatsapp.js
 * Formulário de finalização do pedido, gravação no banco e mensagem do WhatsApp.
 *
 * Ao enviar, acontece nesta ordem:
 *   1. A aba do WhatsApp é aberta NA HORA do clique (em branco). Navegadores só deixam
 *      abrir aba direto de um toque do usuário; se esperássemos a resposta do banco
 *      primeiro, o Safari/iPhone poderia bloquear.
 *   2. O pedido é gravado pela função place_order do Supabase: grava pedido + itens e
 *      DESCONTA O ESTOQUE numa transação só (tudo ou nada).
 *   3. Deu certo (ou falhou por rede): a aba do WhatsApp recebe a mensagem e aparece a
 *      tela "Quase lá!" (com o código Pix, se for o caso).
 *      Faltou estoque: a aba em branco é fechada, NADA é enviado, o carrinho é ajustado.
 *
 * Se a gravação falhar por motivo que não seja estoque (rede caiu, etc.), o WhatsApp
 * abre mesmo assim: o cliente não pode ficar sem conseguir pedir só porque o registro falhou.
 *
 * Total = itens + taxa de entrega (só na opção "Entrega"; vem de PM.SETTINGS.delivery_fee).
 */

PM.WhatsApp = (function () {
  // Número real da loja: +55 91 8605-6549
  var NUMBER = "559186056549";

  var deliveryType = "retirada";
  var payment = null; // "dinheiro" | "cartao" | "pix" | null (ainda não escolhido)
  var cardType = null; // "credito" | "debito" | null
  var sending = false;
  var els = {};

  function cacheEls() {
    els.modal = document.getElementById("checkoutModal");
    els.overlay = document.getElementById("overlay");
    els.closeModal = document.getElementById("closeModal");
    els.checkoutForm = document.getElementById("checkoutForm");
    els.checkoutDone = document.getElementById("checkoutDone");
    els.closedNotice = document.getElementById("closedNotice");
    els.deliveryOpts = document.querySelectorAll(".delivery-opt");
    els.deliveryFields = document.getElementById("deliveryFields");
    els.payOpts = document.querySelectorAll(".pay-opt");
    els.cashFields = document.getElementById("cashFields");
    els.cardFields = document.getElementById("cardFields");
    els.pixNote = document.getElementById("pixNote");
    els.cardOpts = document.querySelectorAll(".card-opt");
    els.name = document.getElementById("custName");
    els.notes = document.getElementById("custNotes");
    els.address = document.getElementById("custAddress");
    els.number = document.getElementById("custNumber");
    els.hood = document.getElementById("custHood");
    els.change = document.getElementById("custChange");
    els.subtotalRow = document.getElementById("subtotalRow");
    els.modalSubtotal = document.getElementById("modalSubtotal");
    els.feeRow = document.getElementById("feeRow");
    els.modalFee = document.getElementById("modalFee");
    els.modalTotal = document.getElementById("modalTotal");
    els.error = document.getElementById("checkoutError");
    els.sendBtn = document.getElementById("sendWhatsApp");
    els.contactBtn = document.getElementById("contactWhatsApp");
    // tela "Quase lá!"
    els.doneText = document.getElementById("doneText");
    els.doneWa = document.getElementById("doneWhatsApp");
    els.doneClose = document.getElementById("doneClose");
    els.doneCloseX = document.getElementById("doneCloseX");
    els.pixPanel = document.getElementById("pixPanel");
    els.pixAmount = document.getElementById("pixAmount");
    els.pixConfigured = document.getElementById("pixConfigured");
    els.pixPending = document.getElementById("pixPending");
    els.pixKeyType = document.getElementById("pixKeyType");
    els.pixKeyValue = document.getElementById("pixKeyValue");
    els.pixCopyKey = document.getElementById("pixCopyKey");
    els.pixCopyCode = document.getElementById("pixCopyCode");
    els.pixCodeText = document.getElementById("pixCodeText");
  }

  function whatsappUrl(text) {
    return "https://wa.me/" + NUMBER + (text ? "?text=" + encodeURIComponent(text) : "");
  }

  function openLink(text) {
    window.open(whatsappUrl(text), "_blank", "noopener");
  }

  /** Pergunta rápida sobre um produto "sob consulta" (sem preço fixo). */
  function askAbout(product) {
    openLink("Olá! Gostaria de saber o valor de: " + product.name);
  }

  // ---------------- Aba do WhatsApp aberta no clique ----------------
  function openBlank() {
    try {
      var w = window.open("", "_blank");
      if (w) {
        try { w.opener = null; } catch (e) { /* ignora */ }
      }
      return w || null;
    } catch (e) {
      return null;
    }
  }

  function closeBlank(w) {
    try { if (w && !w.closed) w.close(); } catch (e) { /* ignora */ }
  }

  /** Manda a aba que já estava aberta pro WhatsApp. Se o navegador não deixou abrir antes, tenta de novo. */
  function goTo(w, url) {
    try {
      if (w && !w.closed) {
        w.location.href = url;
        return;
      }
    } catch (e) { /* a aba virou inutilizável (ex: o cliente fechou): tenta abrir de novo abaixo */ }
    try { window.open(url, "_blank", "noopener"); } catch (e) { /* o botão da tela "Quase lá!" cobre esse caso */ }
  }

  // ---------------- Valores ----------------
  function currentFee() {
    return deliveryType === "entrega" ? PM.SETTINGS.delivery_fee : 0;
  }

  function orderTotal() {
    return PM.Store.round2(PM.Cart.total() + currentFee());
  }

  function updateTotals() {
    var isDelivery = deliveryType === "entrega";
    els.subtotalRow.classList.toggle("hidden", !isDelivery);
    els.feeRow.classList.toggle("hidden", !isDelivery);
    els.modalSubtotal.textContent = PM.formatBRL(PM.Cart.total());
    els.modalFee.textContent = currentFee() > 0 ? PM.formatBRL(currentFee()) : "Grátis";
    els.modalTotal.textContent = PM.formatBRL(orderTotal());
  }

  // ---------------- Erros ----------------
  function showError(message, focusEl) {
    els.error.textContent = message;
    if (focusEl && focusEl.focus) focusEl.focus();
  }

  function clearError() {
    els.error.textContent = "";
  }

  // ---------------- Abrir / fechar ----------------
  function showForm() {
    els.checkoutForm.classList.remove("hidden");
    els.checkoutDone.classList.add("hidden");
  }

  function showDoneView() {
    els.checkoutForm.classList.add("hidden");
    els.checkoutDone.classList.remove("hidden");
  }

  function updateClosedNotice() {
    var st = PM.Store.openStatus(PM.SETTINGS.opening_hours, new Date());
    if (st.open) {
      els.closedNotice.classList.add("hidden");
      return;
    }
    els.closedNotice.textContent =
      "Estamos fechados agora" +
      (st.nextOpen ? " (abrimos " + PM.Store.nextOpenPhrase(st.nextOpen) + ")" : "") +
      ". Você pode enviar o pedido, mas ele só será visto quando abrirmos.";
    els.closedNotice.classList.remove("hidden");
  }

  function openCheckout() {
    if (PM.Cart.isEmpty()) return;
    PM.Cart.prune(); // algo pode ter acabado/saído do ar desde que entrou no carrinho
    if (PM.Cart.isEmpty()) return;
    showForm();
    updateClosedNotice();
    clearError();
    updateTotals();
    els.modal.classList.add("show");
    els.overlay.classList.add("show");
  }

  function closeCheckout() {
    els.modal.classList.remove("show");
    els.overlay.classList.remove("show");
    showForm(); // da próxima vez abre no formulário, não na tela "Quase lá!"
  }

  // ---------------- Escolhas do formulário ----------------
  function markActive(opts, attr, value) {
    opts.forEach(function (opt) {
      var on = opt.dataset[attr] === value;
      opt.classList.toggle("active", on);
      opt.setAttribute("aria-checked", on ? "true" : "false");
    });
  }

  function selectDelivery(type) {
    deliveryType = type;
    markActive(els.deliveryOpts, "delivery", type);
    els.deliveryFields.classList.toggle("hidden", type !== "entrega");
    clearError();
    updateTotals();
  }

  function selectPayment(method) {
    payment = method;
    markActive(els.payOpts, "pay", method);
    els.cashFields.classList.toggle("hidden", method !== "dinheiro");
    els.cardFields.classList.toggle("hidden", method !== "cartao");
    els.pixNote.classList.toggle("hidden", method !== "pix");
    // o que não vale mais pra forma escolhida não pode "vazar" pro pedido
    if (method !== "cartao") selectCard(null);
    if (method !== "dinheiro") els.change.value = "";
    clearError();
  }

  function selectCard(type) {
    cardType = type;
    markActive(els.cardOpts, "card", type);
    clearError();
  }

  function resetForm() {
    els.name.value = "";
    els.notes.value = "";
    els.address.value = "";
    els.number.value = "";
    els.hood.value = "";
    els.change.value = "";
    selectDelivery("retirada");
    selectPayment(null);
    clearError();
  }

  // ---------------- Validação ----------------
  /**
   * @returns {{error:?string, focus:?Element, changeFor:?number}}
   * changeFor = valor com que o cliente vai pagar em dinheiro (null se não precisa de troco).
   */
  function validate() {
    var total = orderTotal();

    if (!els.name.value.trim()) return { error: "Informe seu nome.", focus: els.name };
    if (deliveryType === "entrega" && !els.address.value.trim()) {
      return { error: "Informe o endereço para a entrega.", focus: els.address };
    }
    if (!payment) return { error: "Escolha a forma de pagamento.", focus: els.payOpts[0] };
    if (payment === "cartao" && !cardType) return { error: "Escolha crédito ou débito.", focus: els.cardOpts[0] };

    var changeFor = null;
    if (payment === "dinheiro" && els.change.value.trim() !== "") {
      var value = PM.Store.parseMoney(els.change.value);
      if (isNaN(value)) {
        return {
          error: "Informe o valor do troco em reais (ex: 50,00) ou deixe em branco se não precisar de troco.",
          focus: els.change
        };
      }
      if (value < total) {
        return {
          error: "O valor para o troco precisa ser igual ou maior que o total do pedido (" + PM.formatBRL(total) + ").",
          focus: els.change
        };
      }
      changeFor = value > total ? value : null; // pagar o valor exato = não precisa de troco
    }
    return { error: null, focus: null, changeFor: changeFor };
  }

  // ---------------- Mensagem do WhatsApp ----------------
  function paymentLine(changeFor) {
    if (payment === "pix") return "Pagamento: Pix";
    if (payment === "cartao") return "Pagamento: Cartão de " + (cardType === "credito" ? "crédito" : "débito");
    if (changeFor) {
      return (
        "Pagamento: Dinheiro — troco para " + PM.formatBRL(changeFor) +
        " (troco de " + PM.formatBRL(PM.Store.round2(changeFor - orderTotal())) + ")"
      );
    }
    return "Pagamento: Dinheiro — sem troco";
  }

  function buildOrderMessage(name, changeFor) {
    var lines = [];
    lines.push("Olá! Gostaria de fazer um pedido na Prado Moncherri 🍰", "");
    lines.push("*Pedido:*");

    PM.Cart.items().forEach(function (row) {
      lines.push(row.qty + "x " + row.label + " — " + PM.formatBRL(row.subtotal));
    });

    lines.push("");
    if (deliveryType === "entrega") {
      lines.push("Subtotal: " + PM.formatBRL(PM.Cart.total()));
      lines.push("Taxa de entrega: " + (currentFee() > 0 ? PM.formatBRL(currentFee()) : "grátis"));
    }
    lines.push("*Total: " + PM.formatBRL(orderTotal()) + "*", "");

    lines.push("Nome: " + name);
    lines.push("Forma de recebimento: " + (deliveryType === "entrega" ? "Entrega" : "Retirada"));

    if (deliveryType === "entrega") {
      var addr = els.address.value.trim();
      var num = els.number.value.trim();
      var hood = els.hood.value.trim();
      lines.push("Endereço: " + [addr, num].filter(Boolean).join(", ") + (hood ? " — " + hood : ""));
    }

    lines.push(paymentLine(changeFor));

    var notes = els.notes.value.trim();
    if (notes) lines.push("", "Observação:", notes);

    return lines.join("\n");
  }

  // ---------------- Gravação (Supabase) ----------------
  /** UUID gerado no navegador: o mesmo id serve pra reenviar sem duplicar o pedido nem o desconto de estoque. */
  function generateOrderId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function buildOrder(orderId, name, notes, changeFor) {
    var isDelivery = deliveryType === "entrega";
    return {
      id: orderId,
      customer_name: name,
      delivery_type: deliveryType,
      address: isDelivery ? els.address.value.trim() || null : null,
      address_number: isDelivery ? els.number.value.trim() || null : null,
      neighborhood: isDelivery ? els.hood.value.trim() || null : null,
      notes: notes || null,
      delivery_fee: currentFee(),
      total: orderTotal(),
      payment_method: payment,
      card_type: payment === "cartao" ? cardType : null,
      change_for: payment === "dinheiro" ? changeFor : null,
      items: PM.Cart.items().map(function (row) {
        return {
          product_id: row.product.id,
          product_name: row.label, // já inclui o sabor, ex: "Especial de Fatias — Chocolate"
          unit_price: row.price,
          quantity: row.qty,
          subtotal: row.subtotal
        };
      })
    };
  }

  /** Devolve "saved", "skipped" (sem conexão com o banco, ex: prévia) ou lança o erro. */
  async function saveOrder(order) {
    if (!PM.client) return "skipped";
    var result = await PM.client.rpc("place_order", { p_order: order });
    if (result.error) throw result.error;
    return "saved";
  }

  function isStockError(err) {
    return !!err && err.code === "PM001";
  }

  function parseShortages(err) {
    try {
      var list = JSON.parse(err.details);
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  /** O banco recusou por falta de estoque: atualiza o que sabemos, ajusta o carrinho e deixa o cliente conferir. */
  function handleStockError(err) {
    parseShortages(err).forEach(function (s) {
      var product = PM.findProduct(Number(s.product_id));
      if (product) product.stock = Number(s.available);
    });
    PM.Cart.prune(); // remove o que esgotou, reduz o que passou do estoque (e avisa)
    if (PM.Menu) PM.Menu.renderAll();
    if (PM.Cart.isEmpty()) {
      closeCheckout();
      return;
    }
    updateTotals();
    showError("Alguns itens acabaram enquanto você fazia o pedido. Ajustamos o carrinho: confira os valores e envie de novo.");
  }

  /** Depois de gravar, o que sobrou no estoque aqui na tela diminui (sem esperar recarregar). */
  function applyLocalStock(items) {
    items.forEach(function (row) {
      var p = row.product;
      if (p.stock != null) p.stock = Math.max(0, p.stock - row.qty);
    });
  }

  // ---------------- Tela "Quase lá!" e Pix ----------------
  function legacyCopy(text) {
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return !!ok;
    } catch (e) {
      return false;
    }
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }

  function copyAndToast(text, okMessage) {
    copyText(text).then(function (ok) {
      PM.toast(ok ? okMessage : "Não deu pra copiar sozinho: selecione o código e copie.");
    });
  }

  function renderPixPanel(total) {
    var cfg = PM.SETTINGS.pix;
    els.pixPanel.classList.remove("hidden");
    els.pixAmount.textContent = PM.formatBRL(total);

    if (!cfg) {
      // Dona ainda não cadastrou a chave: o Pix fica combinado pelo WhatsApp
      els.pixConfigured.classList.add("hidden");
      els.pixPending.classList.remove("hidden");
      return;
    }
    els.pixPending.classList.add("hidden");
    els.pixConfigured.classList.remove("hidden");
    els.pixKeyType.textContent = PM.Pix.keyTypeLabel(cfg.key_type);
    els.pixKeyValue.textContent = cfg.key;
    var code = PM.Pix.payload({ key: cfg.key, name: cfg.name, city: cfg.city, amount: total });
    els.pixCodeText.value = code;
    els.pixCopyKey.dataset.copy = cfg.key;
    els.pixCopyCode.dataset.copy = code;
  }

  function showDone(info) {
    els.doneText.textContent = info.saved
      ? "Pedido registrado ✓ Falta só enviar a mensagem no WhatsApp para a Prado Moncherri confirmar."
      : "Falta só enviar a mensagem no WhatsApp para a Prado Moncherri confirmar.";
    els.doneWa.href = info.url;
    if (info.payment === "pix") renderPixPanel(info.total);
    else els.pixPanel.classList.add("hidden");
    showDoneView();
  }

  // ---------------- Envio ----------------
  function finishSending() {
    sending = false;
    els.sendBtn.disabled = false;
    els.sendBtn.textContent = "Enviar pedido pelo WhatsApp";
  }

  function handleSend() {
    if (sending) return; // evita duplo clique = pedido duplicado

    var changed = PM.Cart.prune(); // última conferência de disponibilidade e estoque
    if (changed.length) {
      updateTotals();
      if (PM.Cart.isEmpty()) {
        closeCheckout();
        return;
      }
      showError("Alguns itens mudaram (acabaram ou foram ajustados). Confira o pedido e envie de novo.");
      return;
    }

    var check = validate();
    if (check.error) {
      showError(check.error, check.focus);
      return;
    }
    clearError();

    sending = true;
    els.sendBtn.disabled = true;
    els.sendBtn.textContent = "Enviando...";

    var waWindow = openBlank(); // dentro do clique: ver o comentário no topo do arquivo
    var name = els.name.value.trim();
    var notes = els.notes.value.trim();
    var orderId = generateOrderId();
    var message = buildOrderMessage(name, check.changeFor); // monta ANTES de limpar o carrinho
    var order = buildOrder(orderId, name, notes, check.changeFor);
    var rows = PM.Cart.items();
    var info = { payment: payment, total: orderTotal(), url: whatsappUrl(message), saved: false };

    saveOrder(order)
      .then(
        function (status) { return { status: status }; },
        function (err) { return { err: err }; }
      )
      .then(function (r) {
        if (r.err && isStockError(r.err)) {
          closeBlank(waWindow); // nada é enviado: o pedido não existe
          handleStockError(r.err);
          finishSending();
          return;
        }
        if (r.err) {
          // Não trava o cliente: o WhatsApp abre mesmo se o registro falhar (rede, etc.).
          console.error("Não foi possível registrar o pedido no site (o WhatsApp abre normalmente):", r.err);
        } else if (r.status === "saved") {
          info.saved = true;
          applyLocalStock(rows);
        }
        goTo(waWindow, info.url);
        PM.Cart.clear();
        resetForm();
        showDone(info);
        finishSending();
      });
  }

  function bindUI() {
    els.closeModal.addEventListener("click", closeCheckout);
    els.doneClose.addEventListener("click", closeCheckout);
    els.doneCloseX.addEventListener("click", closeCheckout);
    els.overlay.addEventListener("click", function () {
      closeCheckout();
      PM.Cart.close();
    });
    els.deliveryOpts.forEach(function (opt) {
      opt.addEventListener("click", function () { selectDelivery(opt.dataset.delivery); });
    });
    els.payOpts.forEach(function (opt) {
      opt.addEventListener("click", function () { selectPayment(opt.dataset.pay); });
    });
    els.cardOpts.forEach(function (opt) {
      opt.addEventListener("click", function () { selectCard(opt.dataset.card); });
    });
    [els.name, els.address, els.change].forEach(function (input) {
      input.addEventListener("input", clearError);
    });
    els.sendBtn.addEventListener("click", handleSend);
    els.contactBtn.addEventListener("click", function (e) {
      e.preventDefault();
      openLink("");
    });
    els.pixCopyKey.addEventListener("click", function () {
      copyAndToast(els.pixCopyKey.dataset.copy || "", "Chave Pix copiada!");
    });
    els.pixCopyCode.addEventListener("click", function () {
      copyAndToast(els.pixCopyCode.dataset.copy || "", "Código Pix copiado! Cole no app do seu banco.");
    });
  }

  function init() {
    cacheEls();
    bindUI();
  }

  return {
    init: init,
    askAbout: askAbout,
    openCheckout: openCheckout
  };
})();
