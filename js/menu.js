/**
 * menu.js
 * Barra de categorias, grade de produtos e "queridinhos". Não guarda estado
 * de carrinho — só lê PM.Cart.qtyOf(chave) pra decidir se mostra "Adicionar"
 * ou o contador +/-.
 *
 * O "Especial de Fatias" (produto com has_flavors) é diferente: em vez de um
 * botão só, mostra a lista de sabores da semana, cada um com seu contador.
 * Só aparece pra pedido aos sábados (e nos domingos que a dona liberar).
 */

PM.Menu = (function () {
  var activeCat = "todos";
  var els = {};
  var LOW_STOCK = 5; // abaixo disso mostra "Restam N"

  function esc(s) { return PM.Store.escapeHtml(s); }

  function cacheEls() {
    els.pillBar = document.getElementById("pillBar");
    els.grid = document.getElementById("productGrid");
    els.featScroller = document.getElementById("featScroller");
    els.featSection = document.getElementById("destaques");
    els.featLink = document.getElementById("featLink");
  }

  function specialOpen() {
    return PM.Store.isSpecialOpen(PM.SETTINGS, new Date());
  }

  /** Foto do produto, ou o ícone-moldura enquanto ainda não há foto (campo image_url). */
  function photoHTML(product, small) {
    if (product.image) {
      return '<div class="photo photo-real"><img src="' + esc(product.image) + '" alt="' + esc(product.name) + '" loading="lazy"></div>';
    }
    var icon = PM.ICONS[product.cat] || PM.ICONS.outros;
    var tag = small ? "" : '<span class="tag">foto em breve</span>';
    return '<div class="photo"><div class="ring"></div>' + icon + tag + "</div>";
  }

  /** plusDisabled: já chegou no estoque, não dá pra aumentar mais. */
  function stepperHTML(key, qty, plusDisabled) {
    return (
      '<div class="stepper">' +
      '<button data-act="dec" data-key="' + esc(key) + '" aria-label="Diminuir quantidade">–</button>' +
      "<span>" + qty + "</span>" +
      '<button data-act="inc" data-key="' + esc(key) + '" aria-label="Aumentar quantidade"' +
      (plusDisabled ? ' disabled title="Estoque máximo"' : "") + ">+</button>" +
      "</div>"
    );
  }

  /** "Restam 3" quando o estoque está acabando (só pra produtos com controle de estoque). */
  function stockTagHTML(p) {
    return p.stock != null && p.stock > 0 && p.stock <= LOW_STOCK
      ? '<span class="stock-tag">Restam ' + p.stock + "</span>"
      : "";
  }

  function controlsHTML(p) {
    var key = PM.Cart.keyFor(p.id);
    if (p.price == null) {
      return '<button class="add-btn ask" data-act="ask" data-key="' + esc(key) + '">Perguntar no WhatsApp</button>';
    }
    if (p.stock === 0) return '<button class="add-btn ask" disabled>Esgotado</button>';
    var qty = PM.Cart.qtyOf(key);
    return qty > 0
      ? stepperHTML(key, qty, !PM.Cart.canAddMore(p))
      : '<button class="add-btn" data-act="add" data-key="' + esc(key) + '">Adicionar</button>';
  }

  function priceHTML(p) {
    return p.price != null
      ? '<span class="price">' + PM.formatBRL(p.price) + "</span>"
      : '<span class="price query">Sob consulta</span>';
  }

  // ---------------- Especial de Fatias ----------------
  function flavorBlockHTML(p) {
    if (!specialOpen()) {
      return '<p class="flavor-note">Disponível aos sábados e em alguns domingos.</p>';
    }
    if (p.stock === 0) {
      return '<p class="flavor-note">Esgotado por enquanto.</p>';
    }
    if (PM.FLAVORS_ERROR) {
      return '<p class="flavor-note">Não foi possível carregar os sabores agora. Recarregue a página ou chame a gente no WhatsApp.</p>';
    }
    if (PM.FLAVORS.length === 0) {
      return '<p class="flavor-note">Os sabores de hoje ainda não foram definidos. Chame a gente no WhatsApp para saber!</p>';
    }
    var rows = PM.FLAVORS.map(function (f) {
      var key = PM.Cart.keyFor(p.id, f.id);
      var qty = PM.Cart.qtyOf(key);
      var more = PM.Cart.canAddMore(p); // o estoque do especial vale pra soma de todos os sabores
      var control = !f.available
        ? '<span class="soldout">Esgotado</span>'
        : qty > 0
          ? stepperHTML(key, qty, !more)
          : '<button class="add-btn add-sm" data-act="add" data-key="' + esc(key) + '"' +
            (more ? "" : ' disabled title="Estoque máximo"') + ">Adicionar</button>";
      return (
        '<li class="flavor-row' + (f.available ? "" : " is-soldout") + '">' +
        '<span class="flavor-name">' + esc(f.name) + "</span>" + control + "</li>"
      );
    }).join("");
    return '<p class="flavor-title">Escolha o sabor</p><ul class="flavor-list">' + rows + "</ul>";
  }

  // ---------------- Cartões ----------------
  function cardHTML(p) {
    if (p.has_flavors) {
      return (
        '<div class="card card-flavors' + (p.stock === 0 ? " is-soldout" : "") + '" data-id="' + p.id + '">' +
        photoHTML(p) +
        "<h3>" + esc(p.name) + "</h3>" +
        '<p class="desc">' + esc(p.desc) + "</p>" +
        '<div class="card-bottom">' + priceHTML(p) + stockTagHTML(p) + "</div>" +
        flavorBlockHTML(p) +
        "</div>"
      );
    }
    return (
      '<div class="card' + (p.stock === 0 ? " is-soldout" : "") + '" data-id="' + p.id + '">' +
      photoHTML(p) +
      "<h3>" + esc(p.name) + "</h3>" +
      '<p class="desc">' + esc(p.desc) + "</p>" +
      '<div class="card-bottom">' + priceHTML(p) + stockTagHTML(p) + "</div>" +
      controlsHTML(p) +
      "</div>"
    );
  }

  function featControlsHTML(p) {
    if (!p.has_flavors) return controlsHTML(p);
    var key = PM.Cart.keyFor(p.id);
    if (!specialOpen()) return '<button class="add-btn ask" disabled>Aos sábados</button>';
    if (p.stock === 0) return '<button class="add-btn ask" disabled>Esgotado</button>';
    return '<button class="add-btn" data-act="goto" data-key="' + esc(key) + '">Escolher sabor</button>';
  }

  function featCardHTML(p) {
    return (
      '<div class="feat-card" data-id="' + p.id + '">' +
      photoHTML(p, true) +
      "<h3>" + esc(p.name) + "</h3>" +
      '<div class="feat-price">' + (p.price != null ? PM.formatBRL(p.price) : "Sob consulta") + "</div>" +
      featControlsHTML(p) +
      "</div>"
    );
  }

  // ---------------- Filtro por categoria ----------------
  function renderPills() {
    els.pillBar.innerHTML = PM.CATEGORIES.map(function (c) {
      return (
        '<button class="pill' + (c.id === activeCat ? " active" : "") + '" data-cat="' + esc(c.id) + '">' +
        esc(c.label) +
        "</button>"
      );
    }).join("");
  }

  function renderGrid() {
    var list = PM.PRODUCTS.filter(function (p) {
      return activeCat === "todos" || p.cat === activeCat;
    });
    els.grid.innerHTML = list.map(cardHTML).join("");
  }

  function renderFeatured() {
    var feats = PM.PRODUCTS.filter(function (p) { return p.featured; });
    els.featScroller.innerHTML = feats.map(featCardHTML).join("");
    // Sem nenhum produto em destaque (a dona pode desmarcar todos no painel), esconde a
    // seção inteira e o botão do topo, em vez de deixar um título com espaço vazio.
    var has = feats.length > 0;
    els.featSection.classList.toggle("hidden", !has);
    els.featLink.classList.toggle("hidden", !has);
  }

  function refreshScrollers() {
    if (PM.HScroll) PM.HScroll.refresh();
  }

  function renderAll() {
    // se a categoria ativa deixou de existir (ex: atualização do cardápio), volta pra "Todos"
    var exists = PM.CATEGORIES.some(function (c) { return c.id === activeCat; });
    if (!exists) activeCat = "todos";
    renderPills();
    renderGrid();
    renderFeatured();
    refreshScrollers();
  }

  function setCategory(catId) {
    activeCat = catId;
    renderPills();
    renderGrid();
    refreshScrollers();
  }

  /** Leva o cliente até o cartão do produto no cardápio (usado por "Escolher sabor" nos queridinhos). */
  function focusProduct(productId) {
    setCategory("todos");
    var card = els.grid.querySelector('.card[data-id="' + productId + '"]');
    if (!card) return;
    if (card.scrollIntoView) card.scrollIntoView({ behavior: "smooth", block: "center" });
    card.classList.add("is-highlight");
    setTimeout(function () { card.classList.remove("is-highlight"); }, 1800);
  }

  function handleProductClick(e) {
    var btn = e.target.closest("[data-act]");
    if (!btn || btn.disabled) return;
    var key = btn.dataset.key;
    var act = btn.dataset.act;
    var productId = PM.Cart.parseKey(key).productId;

    if (act === "add") PM.Cart.add(key);
    else if (act === "inc") PM.Cart.increment(key);
    else if (act === "dec") PM.Cart.decrement(key);
    else if (act === "ask") {
      var product = PM.findProduct(productId);
      if (product) PM.WhatsApp.askAbout(product);
    } else if (act === "goto") focusProduct(productId);
  }

  function bindUI() {
    els.pillBar.addEventListener("click", function (e) {
      var btn = e.target.closest(".pill");
      if (btn) setCategory(btn.dataset.cat);
    });
    els.grid.addEventListener("click", handleProductClick);
    els.featScroller.addEventListener("click", handleProductClick);
  }

  function init() {
    cacheEls();
    bindUI();
    renderAll();
    // Sempre que o carrinho mudar, os botões +/- na grade precisam refletir a nova quantidade.
    PM.Cart.onChange(function () {
      renderGrid();
      renderFeatured();
      refreshScrollers();
    });
  }

  return {
    init: init,
    photoHTML: photoHTML,
    setCategory: setCategory,
    renderAll: renderAll,
    focusProduct: focusProduct
  };
})();
