/**
 * whatsapp.js
 * Formulário de finalização de pedido + montagem da mensagem enviada ao
 * WhatsApp da loja. Não guarda dados de produto nem de carrinho — só lê
 * PM.Cart.items()/total() na hora de montar a mensagem.
 *
 * Ordem de implementação (conforme o checklist da Fase 2): Formulário -> Gerar mensagem WhatsApp
 */

PM.WhatsApp = (function () {
  // TODO (Fase 3): substituir pelo número real da loja.
  // Formato: 55 + DDD + número, só dígitos (ex: 55919999999).
  var NUMBER = "5591987446257";

  var deliveryType = "retirada";
  var els = {};

  function cacheEls() {
    els.modal = document.getElementById("checkoutModal");
    els.overlay = document.getElementById("overlay");
    els.modalTotal = document.getElementById("modalTotal");
    els.closeModal = document.getElementById("closeModal");
    els.deliveryFields = document.getElementById("deliveryFields");
    els.radios = document.querySelectorAll(".radio-opt");
    els.name = document.getElementById("custName");
    els.notes = document.getElementById("custNotes");
    els.address = document.getElementById("custAddress");
    els.number = document.getElementById("custNumber");
    els.hood = document.getElementById("custHood");
    els.sendBtn = document.getElementById("sendWhatsApp");
    els.contactBtn = document.getElementById("contactWhatsApp");
  }

  function openLink(text) {
    var url = "https://wa.me/" + NUMBER + (text ? "?text=" + encodeURIComponent(text) : "");
    window.open(url, "_blank", "noopener");
  }

  /** Pergunta rápida sobre um produto "sob consulta" (sem preço fixo). */
  function askAbout(product) {
    openLink("Olá! Gostaria de saber o valor de: " + product.name);
  }

  // ---- Formulário (abrir/fechar modal + forma de recebimento) ----
  function openCheckout() {
    if (PM.Cart.isEmpty()) return;
    els.modalTotal.textContent = PM.formatBRL(PM.Cart.total());
    els.modal.classList.add("show");
    els.overlay.classList.add("show");
  }

  function closeCheckout() {
    els.modal.classList.remove("show");
    els.overlay.classList.remove("show");
  }

  function selectDelivery(type) {
    deliveryType = type;
    els.radios.forEach(function (opt) {
      opt.classList.toggle("active", opt.dataset.value === type);
    });
    els.deliveryFields.classList.toggle("hidden", type !== "entrega");
  }

  // ---- Gerar mensagem WhatsApp ----
  function buildOrderMessage() {
    var lines = [];
    lines.push("Olá! Gostaria de fazer um pedido na Prado Moncherri 🍰", "");
    lines.push("*Pedido:*");

    PM.Cart.items().forEach(function (row) {
      lines.push(row.qty + "x " + row.product.name + " — " + PM.formatBRL(row.subtotal));
    });

    lines.push("", "*Total: " + PM.formatBRL(PM.Cart.total()) + "*", "");
    lines.push("Nome: " + els.name.value.trim());
    lines.push("Forma de recebimento: " + (deliveryType === "entrega" ? "Entrega" : "Retirada"));

    if (deliveryType === "entrega") {
      var addr = els.address.value.trim();
      var num = els.number.value.trim();
      var hood = els.hood.value.trim();
      if (addr || num || hood) {
        lines.push("Endereço: " + [addr, num].filter(Boolean).join(", ") + (hood ? " — " + hood : ""));
      }
    }

    var notes = els.notes.value.trim();
    if (notes) lines.push("", "Observação:", notes);

    return lines.join("\n");
  }

  function handleSend() {
    if (!els.name.value.trim()) {
      els.name.focus();
      return;
    }
    openLink(buildOrderMessage());
  }

  function bindUI() {
    els.closeModal.addEventListener("click", closeCheckout);
    els.overlay.addEventListener("click", function () {
      closeCheckout();
      PM.Cart.close();
    });
    els.radios.forEach(function (opt) {
      opt.addEventListener("click", function () { selectDelivery(opt.dataset.value); });
    });
    els.sendBtn.addEventListener("click", handleSend);
    els.contactBtn.addEventListener("click", function (e) {
      e.preventDefault();
      openLink("");
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
