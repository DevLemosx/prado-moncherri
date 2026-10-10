/**
 * whatsapp.js
 * Formulário de finalização de pedido + mensagem para o WhatsApp da loja.
 *
 * Desde a Fase 5 (passo 3), fechar o pedido faz DUAS coisas, nessa ordem:
 *   1. Grava o pedido em orders/order_items no Supabase (histórico de pedidos)
 *   2. Abre o WhatsApp com a mensagem formatada — SEMPRE, mesmo se o passo 1
 *      falhar por algum motivo (rede, etc.), porque o cliente não pode ficar
 *      sem conseguir mandar o pedido só porque o registro histórico falhou.
 */

PM.WhatsApp = (function () {
  // Número real da loja: +55 91 8605-6549
  var NUMBER = "5591987446257";

  var deliveryType = "retirada";
  var sending = false;
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

  function resetForm() {
    els.name.value = "";
    els.notes.value = "";
    els.address.value = "";
    els.number.value = "";
    els.hood.value = "";
    selectDelivery("retirada");
  }

  // ---- Gerar mensagem WhatsApp ----
  function buildOrderMessage(name) {
    var lines = [];
    lines.push("Olá! Gostaria de fazer um pedido na Prado Moncherri 🍰", "");
    lines.push("*Pedido:*");

    PM.Cart.items().forEach(function (row) {
      lines.push(row.qty + "x " + row.product.name + " — " + PM.formatBRL(row.subtotal));
    });

    lines.push("", "*Total: " + PM.formatBRL(PM.Cart.total()) + "*", "");
    lines.push("Nome: " + name);
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

  /** UUID gerado no navegador — assim já sabemos o id do pedido sem precisar
   *  pedir ele de volta ao banco (que o visitante anônimo não tem permissão
   *  pra ler, só pra criar). */
  function generateOrderId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    // Navegador muito antigo sem crypto.randomUUID: gera um v4 "na mão".
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /** Grava o pedido e seus itens no Supabase (histórico de pedidos). */
  async function saveOrder(orderId, name, notes) {
    if (!PM.client) return; // defensivo: loadCatalog deveria sempre ter criado isso

    var orderRow = {
      id: orderId,
      customer_name: name,
      delivery_type: deliveryType,
      address: deliveryType === "entrega" ? els.address.value.trim() || null : null,
      address_number: deliveryType === "entrega" ? els.number.value.trim() || null : null,
      neighborhood: deliveryType === "entrega" ? els.hood.value.trim() || null : null,
      notes: notes || null,
      total: Number(PM.Cart.total())
    };

    var orderResult = await PM.client.from("orders").insert(orderRow);
    if (orderResult.error) throw orderResult.error;

    var itemRows = PM.Cart.items().map(function (row) {
      return {
        order_id: orderId,
        product_id: row.product.id,
        product_name: row.product.name,
        unit_price: Number(row.product.price),
        quantity: row.qty,
        subtotal: Number(row.subtotal)
      };
    });

    var itemsResult = await PM.client.from("order_items").insert(itemRows);
    if (itemsResult.error) throw itemsResult.error;
  }

  function handleSend() {
    var name = els.name.value.trim();
    if (!name) {
      els.name.focus();
      return;
    }
    if (sending) return; // evita duplo clique = pedido duplicado

    sending = true;
    els.sendBtn.disabled = true;
    els.sendBtn.textContent = "Enviando...";

    var orderId = generateOrderId();
    var notes = els.notes.value.trim();
    var message = buildOrderMessage(name); // monta ANTES de limpar o carrinho

    saveOrder(orderId, name, notes)
      .catch(function (err) {
        // Não trava o cliente: o WhatsApp abre mesmo se o histórico falhar.
        console.error("Não foi possível salvar o pedido no histórico (o WhatsApp abre normalmente):", err);
      })
      .then(function () {
        openLink(message);
        PM.Cart.clear();
        closeCheckout();
        resetForm();
        sending = false;
        els.sendBtn.disabled = false;
        els.sendBtn.textContent = "Enviar pedido pelo WhatsApp";
      });
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
