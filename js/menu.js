/**
 * menu.js
 * Renderiza a barra de categorias, a grade de produtos e os "queridinhos".
 * Não guarda estado de carrinho — só lê PM.Cart.qtyOf(id) para decidir se
 * mostra o botão "Adicionar" ou o contador +/-.
 *
 * Ordem de implementação (conforme o checklist da Fase 2): Filtro por categoria
 */

PM.Menu = (function () {
  var activeCat = "todos";
  var els = {};

  function cacheEls() {
    els.pillBar = document.getElementById("pillBar");
    els.grid = document.getElementById("productGrid");
    els.featScroller = document.getElementById("featScroller");
  }

  /** Placeholder visual do produto (ícone + moldura em anel) até termos foto real.
   *  Se o produto tiver "image" preenchido em products.js, mostra a foto de
   *  verdade em vez do ícone — e a etiqueta "foto em breve" some sozinha.
   */
  function photoHTML(product, small) {
    if (product.image) {
      return '<div class="photo photo-real"><img src="' + product.image + '" alt="' + product.name + '" loading="lazy"></div>';
    }
    var icon = PM.ICONS[product.cat] || PM.ICONS.outros;
    var tag = small ? "" : '<span class="tag">foto em breve</span>';
    return '<div class="photo"><div class="ring"></div>' + icon + tag + "</div>";
  }

  function controlsHTML(p) {
    var qty = PM.Cart.qtyOf(p.id);
    if (p.price == null) {
      return '<button class="add-btn ask" data-act="ask" data-id="' + p.id + '">Perguntar no WhatsApp</button>';
    }
    if (qty > 0) {
      return (
        '<div class="stepper">' +
        '<button data-act="dec" data-id="' + p.id + '">–</button>' +
        "<span>" + qty + "</span>" +
        '<button data-act="inc" data-id="' + p.id + '">+</button>' +
        "</div>"
      );
    }
    return '<button class="add-btn" data-act="add" data-id="' + p.id + '">Adicionar</button>';
  }

  function priceHTML(p) {
    return p.price != null
      ? '<span class="price">' + PM.formatBRL(p.price) + "</span>"
      : '<span class="price query">Sob consulta</span>';
  }

  function cardHTML(p) {
    return (
      '<div class="card" data-id="' + p.id + '">' +
      photoHTML(p) +
      "<h3>" + p.name + "</h3>" +
      '<p class="desc">' + p.desc + "</p>" +
      '<div class="card-bottom">' + priceHTML(p) + "</div>" +
      controlsHTML(p) +
      "</div>"
    );
  }

  function featCardHTML(p) {
    return (
      '<div class="feat-card" data-id="' + p.id + '">' +
      photoHTML(p, true) +
      "<h3>" + p.name + "</h3>" +
      '<div class="feat-price">' + (p.price != null ? PM.formatBRL(p.price) : "Sob consulta") + "</div>" +
      controlsHTML(p) +
      "</div>"
    );
  }

  // ---- Filtro por categoria ----
  function renderPills() {
    els.pillBar.innerHTML = PM.CATEGORIES.map(function (c) {
      return (
        '<button class="pill' + (c.id === activeCat ? " active" : "") + '" data-cat="' + c.id + '">' +
        c.label +
        "</button>"
      );
    }).join("");
  }

  function setCategory(catId) {
    activeCat = catId;
    renderPills();
    renderGrid();
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
  }

  function handleProductClick(e) {
    var btn = e.target.closest("[data-act]");
    if (!btn) return;
    var id = Number(btn.dataset.id);
    var product = PM.findProduct(id);
    if (!product) return;

    switch (btn.dataset.act) {
      case "add": PM.Cart.add(id); break;
      case "inc": PM.Cart.increment(id); break;
      case "dec": PM.Cart.decrement(id); break;
      case "ask": PM.WhatsApp.askAbout(product); break;
    }
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
    renderPills();
    renderGrid();
    renderFeatured();
    // Sempre que o carrinho mudar (add/inc/dec/remove), os botões +/- na grade
    // precisam refletir a nova quantidade.
    PM.Cart.onChange(function () {
      renderGrid();
      renderFeatured();
    });
  }

  return {
    init: init,
    photoHTML: photoHTML,
    setCategory: setCategory
  };
})();
