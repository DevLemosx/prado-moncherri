/**
 * cart.js
 * Estado do carrinho + a interface que depende diretamente dele (badge, barra
 * flutuante e a gaveta lateral). Fica salvo no localStorage do navegador do
 * cliente, então o carrinho sobrevive a um recarregamento da página.
 *
 * Ordem de implementação (conforme o checklist da Fase 2):
 *   Adicionar ao carrinho -> Remover produto -> Alterar quantidade -> Calcular total
 */

PM.Cart = (function () {
  var STORAGE_KEY = "pm_cart";
  var state = {}; // { [productId]: quantidade }
  var listeners = []; // funções chamadas sempre que o carrinho muda

  function load() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      state = saved ? JSON.parse(saved) : {};
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

  /** Outros módulos (menu.js) se inscrevem aqui para re-renderizar quando o carrinho muda. */
  function onChange(fn) {
    listeners.push(fn);
  }

  // ---- Adicionar ao carrinho ----
  function add(id) {
    state[id] = 1;
    notify();
  }

  // ---- Alterar quantidade ----
  function increment(id) {
    state[id] = (state[id] || 0) + 1;
    notify();
  }

  function decrement(id) {
    state[id] = (state[id] || 0) - 1;
    if (state[id] <= 0) delete state[id];
    notify();
  }

  // ---- Remover produto ----
  function remove(id) {
    delete state[id];
    notify();
  }

  function clear() {
    state = {};
    notify();
  }

  function qtyOf(id) {
    return state[id] || 0;
  }

  /** Lista de { product, qty, subtotal } para os itens atualmente no carrinho. */
  function items() {
    var result = [];
    for (var key in state) {
      var product = PM.findProduct(Number(key));
      if (!product) continue;
      result.push({
        product: product,
        qty: state[key],
        subtotal: (product.price || 0) * state[key]
      });
    }
    return result;
  }

  function count() {
    var n = 0;
    for (var key in state) n += state[key];
    return n;
  }

  // ---- Calcular total ----
  function total() {
    var sum = 0;
    items().forEach(function (row) { sum += row.subtotal; });
    return sum;
  }

  function isEmpty() {
    return count() === 0;
  }

  // ---------------- Interface (fab + badge + drawer) ----------------
  var els = {};

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
    var p = row.product;
    return (
      '<div class="cart-item" data-id="' + p.id + '">' +
      PM.Menu.photoHTML(p.cat, true) +
      '<div class="meta">' +
      "<h4>" + p.name + "</h4>" +
      "<small>" + PM.formatBRL(p.price) + " cada</small>" +
      '<div class="row-bottom">' +
      '<div class="stepper">' +
      '<button data-act="dec" data-id="' + p.id + '">–</button>' +
      "<span>" + row.qty + "</span>" +
      '<button data-act="inc" data-id="' + p.id + '">+</button>' +
      "</div>" +
      '<button class="link-remove" data-act="remove" data-id="' + p.id + '">remover</button>' +
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
      var id = Number(btn.dataset.id);
      var act = btn.dataset.act;
      if (act === "inc") increment(id);
      else if (act === "dec") decrement(id);
      else if (act === "remove") remove(id);
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
    render();
  }

  return {
    add: add,
    increment: increment,
    decrement: decrement,
    remove: remove,
    clear: clear,
    qtyOf: qtyOf,
    items: items,
    count: count,
    total: total,
    isEmpty: isEmpty,
    onChange: onChange,
    open: open,
    close: close,
    init: init
  };
})();

/** Formata número em Real brasileiro. Usado por todos os módulos. */
PM.formatBRL = function (value) {
  return "R$ " + Number(value).toFixed(2).replace(".", ",");
};
