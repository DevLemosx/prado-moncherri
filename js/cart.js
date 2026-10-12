/**
 * cart.js
 * Estado do carrinho + a interface que depende dele (badge, barra flutuante
 * e gaveta lateral). Fica salvo no localStorage do navegador do cliente.
 *
 * Cada linha do carrinho tem uma CHAVE:
 *   "12"     -> produto 12
 *   "33:5"   -> produto 33 (Especial de Fatias) no sabor 5
 * Assim o cliente pode pedir 2 fatias de um sabor e 1 de outro como linhas
 * separadas. Carrinhos salvos antes dos sabores existirem (chave só com o
 * número do produto) continuam valendo.
 */

PM.Cart = (function () {
  var STORAGE_KEY = "pm_cart";
  var state = {}; // { chave: quantidade }
  var listeners = [];
  var els = {};

  // ---------------- Chaves ----------------
  function keyFor(productId, flavorId) {
    return flavorId == null ? String(productId) : productId + ":" + flavorId;
  }

  function parseKey(key) {
    var parts = String(key).split(":");
    return { productId: Number(parts[0]), flavorId: parts.length > 1 ? Number(parts[1]) : null };
  }

  /**
   * Descobre o que uma chave representa agora. Devolve null se não dá pra
   * comprar (produto sumiu, é "sob consulta", sabor inexistente...).
   * `available` diz se pode ser comprado AGORA (sabor esgotado ou especial fechado = false).
   */
  function resolve(key) {
    var ids = parseKey(key);
    var product = PM.findProduct(ids.productId);
    if (!product || product.price == null) return null;

    var flavor = null;
    var available = product.stock == null || product.stock > 0; // estoque 0 = esgotado
    if (product.has_flavors) {
      flavor = ids.flavorId == null ? null : PM.findFlavor(ids.flavorId);
      if (!flavor) return null;
      available = available && flavor.available && PM.Store.isSpecialOpen(PM.SETTINGS, new Date());
    } else if (ids.flavorId != null) {
      return null;
    }

    return {
      key: String(key),
      product: product,
      flavor: flavor,
      price: Number(product.price),
      label: flavor ? product.name + " — " + flavor.name : product.name,
      available: available
    };
  }

  // ---------------- Persistência ----------------
  /** Só aceita chaves bem formadas e quantidades inteiras positivas (localStorage pode estar corrompido). */
  function sanitize(obj) {
    var clean = {};
    if (!obj || typeof obj !== "object") return clean;
    Object.keys(obj).forEach(function (k) {
      var q = obj[k];
      if (/^\d+(:\d+)?$/.test(k) && typeof q === "number" && isFinite(q) && q > 0 && Math.floor(q) === q) clean[k] = q;
    });
    return clean;
  }

  function load() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      state = saved ? sanitize(JSON.parse(saved)) : {};
    } catch (e) {
      state = {};
    }
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      /* localStorage indisponível (ex: modo privado) — segue só em memória */
    }
  }

  function notify() {
    persist();
    listeners.forEach(function (fn) { fn(); });
  }

  function onChange(fn) {
    listeners.push(fn);
  }

  // ---------------- Estoque ----------------
  /** Quantas unidades de um produto estão no carrinho (soma das linhas: o especial tem uma por sabor). */
  function productQty(productId) {
    return Object.keys(state).reduce(function (n, k) {
      return parseKey(k).productId === productId ? n + state[k] : n;
    }, 0);
  }

  /** Dá pra pôr mais uma unidade deste produto no carrinho sem passar do estoque? */
  function canAddMore(product) {
    return product.stock == null || productQty(product.id) < product.stock;
  }

  function unitsText(n) {
    return n === 1 ? "1 unidade" : n + " unidades";
  }

  // ---------------- Operações ----------------
  function increment(key) {
    var r = resolve(key);
    if (!r || !r.available) return; // não deixa entrar no carrinho o que não pode ser comprado agora
    if (!canAddMore(r.product)) {
      PM.toast("Só temos " + unitsText(r.product.stock) + " de “" + r.product.name + "” no momento.");
      return;
    }
    state[key] = (state[key] || 0) + 1;
    notify();
  }

  function add(key) {
    increment(key);
  }

  function decrement(key) {
    if (!state[key]) return;
    state[key] -= 1;
    if (state[key] <= 0) delete state[key];
    notify();
  }

  function remove(key) {
    delete state[key];
    notify();
  }

  function clear() {
    state = {};
    notify();
  }

  function qtyOf(key) {
    return state[key] || 0;
  }

  /** Linhas do carrinho que ainda fazem sentido: { key, product, flavor, qty, price, label, subtotal, available }. */
  function items() {
    var rows = [];
    Object.keys(state).forEach(function (key) {
      var r = resolve(key);
      if (!r) return;
      r.qty = state[key];
      r.subtotal = PM.Store.round2(r.price * r.qty);
      rows.push(r);
    });
    return rows;
  }

  function count() {
    return items().reduce(function (n, r) { return n + r.qty; }, 0);
  }

  function total() {
    return PM.Store.round2(items().reduce(function (sum, r) { return sum + r.subtotal; }, 0));
  }

  function isEmpty() {
    return count() === 0;
  }

  /**
   * Tira do carrinho o que não pode mais ser comprado (produto desativado, esgotado,
   * sabor removido, especial fora do dia), reduz o que passou do estoque, e avisa o cliente.
   * Devolve a lista do que mudou (vazia = o carrinho continua exatamente como estava).
   */
  function prune() {
    var removed = [];
    var adjusted = [];

    Object.keys(state).forEach(function (key) {
      var r = resolve(key);
      if (!r || !r.available) {
        removed.push(r ? r.label : "um item");
        delete state[key];
      }
    });

    // Passou do estoque? Corta o excesso (das últimas linhas pra primeira).
    var byProduct = {};
    Object.keys(state).forEach(function (k) {
      var id = parseKey(k).productId;
      (byProduct[id] = byProduct[id] || []).push(k);
    });
    Object.keys(byProduct).forEach(function (id) {
      var product = PM.findProduct(Number(id));
      if (!product || product.stock == null) return;
      var excess = productQty(product.id) - product.stock;
      if (excess <= 0) return;
      byProduct[id].slice().reverse().forEach(function (k) {
        if (excess <= 0) return;
        var cut = Math.min(state[k], excess);
        state[k] -= cut;
        excess -= cut;
        if (state[k] <= 0) delete state[k];
      });
      adjusted.push({ name: product.name, stock: product.stock });
    });

    var messages = [];
    if (removed.length === 1) messages.push("“" + removed[0] + "” saiu do pedido porque não está mais disponível.");
    else if (removed.length > 1) messages.push(removed.length + " itens saíram do pedido porque não estão mais disponíveis.");
    if (adjusted.length === 1) {
      messages.push("Ajustamos “" + adjusted[0].name + "”: só temos " + unitsText(adjusted[0].stock) + ".");
    } else if (adjusted.length > 1) {
      messages.push("Ajustamos a quantidade de " + adjusted.length + " itens ao estoque.");
    }

    if (messages.length) {
      notify();
      PM.toast(messages.join(" "));
    }
    return removed.concat(adjusted.map(function (a) { return a.name; }));
  }

  // ---------------- Interface (fab + badge + gaveta) ----------------
  function cacheEls() {
    els.cartIconBtn = document.getElementById("cartIconBtn");
    els.cartBadge = document.getElementById("cartBadge");
    els.cartFab = document.getElementById("cartFab");
    els.fabCount = document.getElementById("fabCount");
    els.fabTotal = document.getElementById("fabTotal");
    els.overlay = document.getElementById("overlay");
    els.drawer = document.getElementById("drawer");
    els.drawerBody = document.getElementById("drawerBody");
    els.drawerFoot = document.getElementById("drawerFoot");
    els.drawerTotal = document.getElementById("drawerTotal");
    els.closeDrawer = document.getElementById("closeDrawer");
    els.checkoutBtn = document.getElementById("checkoutBtn");
  }

  function cartItemRow(row) {
    var esc = PM.Store.escapeHtml;
    return (
      '<div class="cart-item" data-key="' + esc(row.key) + '">' +
      PM.Menu.photoHTML(row.product, true) +
      '<div class="meta">' +
      "<h4>" + esc(row.label) + "</h4>" +
      "<small>" + PM.formatBRL(row.price) + " cada</small>" +
      '<div class="row-bottom">' +
      '<div class="stepper">' +
      '<button data-act="dec" data-key="' + esc(row.key) + '" aria-label="Diminuir quantidade">–</button>' +
      "<span>" + row.qty + "</span>" +
      '<button data-act="inc" data-key="' + esc(row.key) + '" aria-label="Aumentar quantidade">+</button>' +
      "</div>" +
      '<button class="link-remove" data-act="remove" data-key="' + esc(row.key) + '">remover</button>' +
      "</div></div></div>"
    );
  }

  function render() {
    var n = count();
    var t = total();

    els.fabCount.textContent = n;
    els.fabTotal.textContent = PM.formatBRL(t);
    els.cartFab.classList.toggle("show", n > 0);
    els.cartBadge.textContent = n;
    els.cartBadge.classList.toggle("hidden", n === 0);

    var rows = items();
    if (rows.length === 0) {
      els.drawerBody.innerHTML =
        '<div class="empty-cart">Seu carrinho está vazio.<br>Adicione algo delicioso do cardápio 🍰</div>';
      els.drawerFoot.style.display = "none";
    } else {
      els.drawerBody.innerHTML = rows.map(cartItemRow).join("");
      els.drawerFoot.style.display = "flex";
      els.drawerTotal.textContent = PM.formatBRL(t);
    }
  }

  function open() {
    els.drawer.classList.add("show");
    els.overlay.classList.add("show");
  }
  function close() {
    els.drawer.classList.remove("show");
    els.overlay.classList.remove("show");
  }

  function bindUI() {
    els.cartIconBtn.addEventListener("click", open);
    els.cartFab.addEventListener("click", open);
    els.closeDrawer.addEventListener("click", close);

    els.drawerBody.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-act]");
      if (!btn) return;
      var key = btn.dataset.key;
      var act = btn.dataset.act;
      if (act === "inc") increment(key);
      else if (act === "dec") decrement(key);
      else if (act === "remove") remove(key);
    });

    els.checkoutBtn.addEventListener("click", function () {
      close();
      PM.WhatsApp.openCheckout();
    });
  }

  function init() {
    load();
    cacheEls();
    bindUI();
    onChange(render);
    prune(); // o carrinho salvo pode ter itens que deixaram de existir/estar disponíveis
    render();
  }

  return {
    keyFor: keyFor,
    parseKey: parseKey,
    add: add,
    increment: increment,
    decrement: decrement,
    remove: remove,
    clear: clear,
    qtyOf: qtyOf,
    productQty: productQty,
    canAddMore: canAddMore,
    items: items,
    count: count,
    total: total,
    isEmpty: isEmpty,
    prune: prune,
    onChange: onChange,
    render: function () { if (els.cartFab) render(); },
    open: open,
    close: close,
    init: init
  };
})();

/** Aviso rápido na parte de baixo da tela (some sozinho). */
PM.toast = function (message) {
  var el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(PM._toastTimer);
  PM._toastTimer = setTimeout(function () { el.classList.remove("show"); }, 5000);
};
