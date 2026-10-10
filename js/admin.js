/**
 * admin.js
 * Painel administrativo. Página separada (admin.html), não linkada no site
 * público. Só funciona pra quem tiver login criado no Supabase Auth — as
 * políticas de RLS já tratam o resto: usuário autenticado pode editar
 * produtos/categorias e ler/atualizar pedidos; sem login, nada disso é
 * possível (ver passo 4 do README).
 */

window.PM = window.PM || {};

PM.Admin = (function () {
  var client;
  var els = {};
  var categories = []; // [{id, slug, label}]
  var STATUS_OPTIONS = [
    { value: "novo", label: "Novo" },
    { value: "confirmado", label: "Confirmado" },
    { value: "em_preparo", label: "Em preparo" },
    { value: "pronto", label: "Pronto" },
    { value: "entregue", label: "Entregue" },
    { value: "cancelado", label: "Cancelado" }
  ];

  function cacheEls() {
    els.loginScreen = document.getElementById("loginScreen");
    els.appScreen = document.getElementById("appScreen");
    els.loginForm = document.getElementById("loginForm");
    els.loginEmail = document.getElementById("loginEmail");
    els.loginPassword = document.getElementById("loginPassword");
    els.loginBtn = document.getElementById("loginBtn");
    els.loginError = document.getElementById("loginError");
    els.whoAmI = document.getElementById("whoAmI");
    els.logoutBtn = document.getElementById("logoutBtn");
    els.tabs = document.querySelectorAll(".tab-btn");
    els.panelProdutos = document.getElementById("panelProdutos");
    els.panelPedidos = document.getElementById("panelPedidos");
    els.productsBody = document.getElementById("productsBody");
    els.ordersList = document.getElementById("ordersList");
  }

  // ---------------- Autenticação ----------------
  function handleLogin(e) {
    e.preventDefault();
    els.loginError.textContent = "";
    els.loginBtn.disabled = true;
    els.loginBtn.textContent = "Entrando...";

    client.auth
      .signInWithPassword({
        email: els.loginEmail.value.trim(),
        password: els.loginPassword.value
      })
      .then(function (result) {
        if (result.error) {
          els.loginError.textContent = "E-mail ou senha incorretos.";
        }
        // Em caso de sucesso, onAuthStateChange cuida de trocar de tela.
      })
      .finally(function () {
        els.loginBtn.disabled = false;
        els.loginBtn.textContent = "Entrar";
      });
  }

  function handleLogout() {
    client.auth.signOut();
  }

  function showApp(session) {
    els.loginScreen.classList.add("hidden");
    els.appScreen.classList.remove("hidden");
    els.whoAmI.textContent = session.user.email;
    els.loginForm.reset();
    loadProducts();
    loadOrders();
  }

  function showLogin() {
    els.appScreen.classList.add("hidden");
    els.loginScreen.classList.remove("hidden");
  }

  // ---------------- Abas ----------------
  function bindTabs() {
    els.tabs.forEach(function (btn) {
      btn.addEventListener("click", function () {
        els.tabs.forEach(function (b) { b.classList.toggle("active", b === btn); });
        var tab = btn.dataset.tab;
        els.panelProdutos.classList.toggle("hidden", tab !== "produtos");
        els.panelPedidos.classList.toggle("hidden", tab !== "pedidos");
      });
    });
  }

  // ---------------- Produtos ----------------
  function categoryOptionsHTML(selectedId) {
    return categories
      .map(function (c) {
        return '<option value="' + c.id + '"' + (c.id === selectedId ? " selected" : "") + ">" + c.label + "</option>";
      })
      .join("");
  }

  function productRowHTML(p) {
    return (
      '<tr data-id="' + p.id + '">' +
      '<td class="col-name"><input type="text" data-field="name" value="' + escapeAttr(p.name) + '"></td>' +
      '<td><select data-field="category_id">' + categoryOptionsHTML(p.category_id) + "</select></td>" +
      '<td class="col-desc"><textarea data-field="description">' + escapeHtml(p.description || "") + "</textarea></td>" +
      '<td class="col-image"><input type="text" data-field="image_url" value="' + escapeAttr(p.image_url || "") + '" placeholder="assets/produtos/..."></td>' +
      '<td><input type="number" step="0.01" min="0" data-field="price" value="' + (p.price != null ? p.price : "") + '" placeholder="sob consulta"></td>' +
      '<td><input type="number" step="1" min="0" data-field="stock_qty" value="' + (p.stock_qty != null ? p.stock_qty : "") + '" placeholder="sem controle"></td>' +
      '<td><input type="checkbox" data-field="available"' + (p.available ? " checked" : "") + "></td>" +
      '<td><input type="checkbox" data-field="featured"' + (p.featured ? " checked" : "") + "></td>" +
      '<td class="save-cell"><button class="btn btn-primary btn-sm" data-act="save">Salvar</button></td>' +
      "</tr>"
    );
  }

  /** admin.html não carrega cart.js, então tem sua própria cópia — não depende do site público. */
  function formatBRL(value) {
    return "R$ " + Number(value).toFixed(2).replace(".", ",");
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; });
  }
  function escapeAttr(str) {
    return escapeHtml(str).replace(/"/g, "&quot;");
  }

  function readRowValues(tr) {
    var get = function (field) { return tr.querySelector('[data-field="' + field + '"]'); };
    var priceRaw = get("price").value.trim();
    var stockRaw = get("stock_qty").value.trim();
    return {
      name: get("name").value.trim(),
      category_id: Number(get("category_id").value),
      description: get("description").value.trim(),
      image_url: get("image_url").value.trim() || null,
      price: priceRaw === "" ? null : Number(priceRaw),
      stock_qty: stockRaw === "" ? null : parseInt(stockRaw, 10),
      available: get("available").checked,
      featured: get("featured").checked
    };
  }

  async function loadProducts() {
    els.productsBody.innerHTML = '<tr><td colspan="9" class="empty-state">Carregando produtos…</td></tr>';

    var catResult = await client.from("categories").select("id, slug, label").order("sort_order");
    if (catResult.error) {
      els.productsBody.innerHTML = '<tr><td colspan="9" class="empty-state">Erro ao carregar categorias.</td></tr>';
      return;
    }
    categories = catResult.data;

    var prodResult = await client
      .from("products")
      .select("id, name, description, price, category_id, image_url, featured, available, stock_qty")
      .order("id");
    if (prodResult.error) {
      els.productsBody.innerHTML = '<tr><td colspan="9" class="empty-state">Erro ao carregar produtos.</td></tr>';
      return;
    }

    els.productsBody.innerHTML = prodResult.data.map(productRowHTML).join("");
  }

  function bindProductsTable() {
    els.productsBody.addEventListener("click", async function (e) {
      var btn = e.target.closest('[data-act="save"]');
      if (!btn) return;
      var tr = btn.closest("tr");
      var id = Number(tr.dataset.id);
      var values = readRowValues(tr);

      btn.disabled = true;
      btn.textContent = "Salvando...";

      var result = await client.from("products").update(values).eq("id", id);

      btn.disabled = false;
      btn.textContent = "Salvar";

      if (result.error) {
        alert("Não foi possível salvar: " + result.error.message);
        return;
      }
      tr.classList.add("row-saved");
      setTimeout(function () { tr.classList.remove("row-saved"); }, 1200);
    });
  }

  // ---------------- Pedidos ----------------
  function statusOptionsHTML(selected) {
    return STATUS_OPTIONS.map(function (s) {
      return '<option value="' + s.value + '"' + (s.value === selected ? " selected" : "") + ">" + s.label + "</option>";
    }).join("");
  }

  function orderCardHTML(order) {
    var items = (order.order_items || [])
      .map(function (i) {
        return "<li><span>" + i.quantity + "x " + escapeHtml(i.product_name) + "</span><span>" + formatBRL(i.subtotal) + "</span></li>";
      })
      .join("");

    var deliveryLine =
      order.delivery_type === "entrega"
        ? "Entrega — " + [order.address, order.address_number].filter(Boolean).join(", ") + (order.neighborhood ? " — " + order.neighborhood : "")
        : "Retirada";

    var when = new Date(order.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

    return (
      '<article class="order-card" data-id="' + order.id + '">' +
      '<div class="order-top">' +
      "<h3>" + escapeHtml(order.customer_name) + "</h3>" +
      '<span class="order-meta">' + when + "</span>" +
      "</div>" +
      '<div class="order-meta">' + escapeHtml(deliveryLine) + "</div>" +
      '<ul class="order-items">' + items + "</ul>" +
      '<div class="order-total">' + formatBRL(order.total) + "</div>" +
      (order.notes ? '<div class="order-extra">Obs: ' + escapeHtml(order.notes) + "</div>" : "") +
      '<div class="order-bottom">' +
      '<select class="status-select" data-status="' + order.status + '">' + statusOptionsHTML(order.status) + "</select>" +
      "</div>" +
      "</article>"
    );
  }

  async function loadOrders() {
    els.ordersList.innerHTML = '<p class="empty-state">Carregando pedidos…</p>';

    var result = await client
      .from("orders")
      .select("*, order_items(*)")
      .order("created_at", { ascending: false });

    if (result.error) {
      els.ordersList.innerHTML = '<p class="empty-state">Erro ao carregar pedidos.</p>';
      return;
    }
    if (result.data.length === 0) {
      els.ordersList.innerHTML = '<p class="empty-state">Nenhum pedido ainda.</p>';
      return;
    }
    els.ordersList.innerHTML = result.data.map(orderCardHTML).join("");
  }

  function bindOrdersList() {
    els.ordersList.addEventListener("change", async function (e) {
      var select = e.target.closest(".status-select");
      if (!select) return;
      var card = select.closest(".order-card");
      var orderId = card.dataset.id;
      var newStatus = select.value;

      select.disabled = true;
      var result = await client.from("orders").update({ status: newStatus }).eq("id", orderId);
      select.disabled = false;

      if (result.error) {
        alert("Não foi possível mudar o status: " + result.error.message);
        return;
      }
      select.dataset.status = newStatus;
    });
  }

  function bindUI() {
    els.loginForm.addEventListener("submit", handleLogin);
    els.logoutBtn.addEventListener("click", handleLogout);
    bindTabs();
    bindProductsTable();
    bindOrdersList();
  }

  function init() {
    client = window.supabase.createClient(PM.CONFIG.SUPABASE_URL, PM.CONFIG.SUPABASE_ANON_KEY);
    cacheEls();
    bindUI();
    client.auth.onAuthStateChange(function (_event, session) {
      if (session) showApp(session);
      else showLogin();
    });
  }

  return { init: init };
})();

document.addEventListener("DOMContentLoaded", function () {
  PM.Admin.init();
});
