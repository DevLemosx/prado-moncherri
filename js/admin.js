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
  var settings = PM.Store.normalizeSettings(null); // taxa, horários, domingo do especial
  var settingsOk = false; // false = não deu pra ler: NÃO deixa salvar (gravaria os padrões por cima do que a dona configurou)
  var origRows = {}; // produto -> valores como estavam no banco ao desenhar a linha (pra salvar só o que mudou)
  var flavors = []; // sabores do especial
  var flavorsOk = false;
  var msgTimers = {};
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
    els.panelResumo = document.getElementById("panelResumo");
    els.summaryBody = document.getElementById("summaryBody");
    els.periodBtns = document.querySelectorAll(".period-btn");
    els.refreshOrders = document.getElementById("refreshOrders");
    els.refreshSummary = document.getElementById("refreshSummary");
    els.panelEspecial = document.getElementById("panelEspecial");
    els.panelLoja = document.getElementById("panelLoja");
    els.specialStatus = document.getElementById("specialStatus");
    els.sundayToggle = document.getElementById("sundayToggle");
    els.sundayLabel = document.getElementById("sundayLabel");
    els.sundayMsg = document.getElementById("sundayMsg");
    els.flavorList = document.getElementById("flavorList");
    els.flavorAddForm = document.getElementById("flavorAddForm");
    els.flavorNewName = document.getElementById("flavorNewName");
    els.flavorMsg = document.getElementById("flavorMsg");
    els.flavorClear = document.getElementById("flavorClear");
    els.feeInput = document.getElementById("feeInput");
    els.feeSave = document.getElementById("feeSave");
    els.feeMsg = document.getElementById("feeMsg");
    els.storeStatus = document.getElementById("storeStatus");
    els.hoursEditor = document.getElementById("hoursEditor");
    els.hoursSave = document.getElementById("hoursSave");
    els.hoursMsg = document.getElementById("hoursMsg");
    els.pixType = document.getElementById("pixType");
    els.pixKey = document.getElementById("pixKey");
    els.pixName = document.getElementById("pixName");
    els.pixCity = document.getElementById("pixCity");
    els.pixSave = document.getElementById("pixSave");
    els.pixTest = document.getElementById("pixTest");
    els.pixRemove = document.getElementById("pixRemove");
    els.pixMsg = document.getElementById("pixMsg");
    els.pixTestCode = document.getElementById("pixTestCode");
    els.pixTestHint = document.getElementById("pixTestHint");
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
    loadStoreSettings();
  }

  function showLogin() {
    els.appScreen.classList.add("hidden");
    els.loginScreen.classList.remove("hidden");
    // Higiene em computador compartilhado: não deixa dados de clientes na página depois do logout.
    els.productsBody.innerHTML = "";
    els.ordersList.innerHTML = "";
    els.summaryBody.innerHTML = "";
    els.flavorList.innerHTML = "";
    els.hoursEditor.innerHTML = "";
    settingsOk = false;
  }

  // ---------------- Abas ----------------
  function bindTabs() {
    var panels = {
      produtos: els.panelProdutos, pedidos: els.panelPedidos, resumo: els.panelResumo,
      especial: els.panelEspecial, loja: els.panelLoja
    };
    els.tabs.forEach(function (btn) {
      btn.addEventListener("click", function () {
        els.tabs.forEach(function (b) { b.classList.toggle("active", b === btn); });
        var tab = btn.dataset.tab;
        Object.keys(panels).forEach(function (name) {
          panels[name].classList.toggle("hidden", name !== tab);
        });
        // Pedidos novos chegam o tempo todo: ao abrir essas abas, busca de novo.
        // (Produtos NÃO recarrega ao trocar de aba, pra não perder edição não salva.)
        if (tab === "pedidos") loadOrders();
        if (tab === "produtos") refreshStock();
        if (tab === "resumo") loadSummary();
        // O texto "hoje é ..." depende da hora; recalcula ao abrir. Os campos editáveis
        // NÃO são recarregados aqui (nem os de Produtos), pra não perder o que está sendo digitado.
        if (tab === "especial") renderSpecialStatus();
        if (tab === "loja") renderStoreStatus();
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

  /**
   * Um UPDATE/DELETE bloqueado por permissão NÃO dá erro no Postgres: simplesmente não
   * altera nada. Então, além do erro, conferimos se alguma linha mudou de verdade
   * (as gravações pedem .select() pra devolver as linhas afetadas).
   * Devolve o motivo da falha, ou null se deu certo.
   */
  function writeFailure(result) {
    if (result.error) {
      var e = result.error;
      if (e.code === "PM003") { // reativar pedido cancelado sem estoque suficiente
        try {
          var list = JSON.parse(e.details);
          return "estoque insuficiente para reativar este pedido: " +
            list.map(function (x) { return x.name + " (restam " + x.available + ")"; }).join(", ");
        } catch (err) { /* cai na mensagem genérica */ }
      }
      return e.message;
    }
    if (!result.data || result.data.length === 0) {
      return "nada foi alterado (sua sessão pode ter expirado — saia e entre de novo)";
    }
    return null;
  }

  /** vem do store.js, que o admin.html carrega antes deste arquivo */
  function formatBRL(value) {
    return PM.formatBRL(value);
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

  /** O mesmo formato de readRowValues, a partir do que veio do banco. */
  function rowValuesFromProduct(p) {
    return {
      name: p.name,
      category_id: p.category_id,
      description: (p.description || "").trim(),
      image_url: p.image_url || null,
      price: p.price == null ? null : Number(p.price),
      stock_qty: p.stock_qty == null ? null : Number(p.stock_qty),
      available: !!p.available,
      featured: !!p.featured
    };
  }

  /**
   * O estoque muda sozinho (cada pedido desconta; cancelar devolve). Se a tela mostrar um número
   * velho e a dona salvar a linha, o número velho voltaria por cima do atual. Por isso:
   *  - só o que ela de fato mudou é enviado (ver bindProductsTable), e
   *  - aqui, ao abrir a aba, os campos de estoque que ela NÃO mexeu são atualizados.
   */
  async function refreshStock() {
    var res = await client.from("products").select("id, stock_qty").order("id");
    if (res.error) return;
    res.data.forEach(function (p) {
      var tr = els.productsBody.querySelector('tr[data-id="' + p.id + '"]');
      var orig = origRows[p.id];
      if (!tr || !orig) return;
      var input = tr.querySelector('[data-field="stock_qty"]');
      var shown = input.value.trim();
      var wasShown = orig.stock_qty == null ? "" : String(orig.stock_qty);
      if (shown !== wasShown) return; // ela está mexendo nesse campo: não pisa no que ela digitou
      var fresh = p.stock_qty == null ? null : Number(p.stock_qty);
      input.value = fresh == null ? "" : String(fresh);
      orig.stock_qty = fresh;
    });
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

    origRows = {};
    prodResult.data.forEach(function (p) { origRows[p.id] = rowValuesFromProduct(p); });
    els.productsBody.innerHTML = prodResult.data.map(productRowHTML).join("");
  }

  function bindProductsTable() {
    els.productsBody.addEventListener("click", async function (e) {
      var btn = e.target.closest('[data-act="save"]');
      if (!btn) return;
      var tr = btn.closest("tr");
      var id = Number(tr.dataset.id);
      var values = readRowValues(tr);

      if (values.stock_qty !== null && (isNaN(values.stock_qty) || values.stock_qty < 0)) {
        alert("Estoque inválido: use 0 ou mais, ou deixe vazio para não controlar.");
        return;
      }

      // Só o que mudou desde que a linha foi desenhada (senão um estoque velho na tela sobrescreveria o atual)
      var orig = origRows[id] || {};
      var changes = {};
      Object.keys(values).forEach(function (k) {
        if (values[k] !== orig[k]) changes[k] = values[k];
      });
      if (Object.keys(changes).length === 0) {
        btn.textContent = "Sem mudanças";
        setTimeout(function () { btn.textContent = "Salvar"; }, 1200);
        return;
      }

      btn.disabled = true;
      btn.textContent = "Salvando...";

      var result = await client.from("products").update(changes).eq("id", id).select("id");

      btn.disabled = false;
      btn.textContent = "Salvar";

      var failure = writeFailure(result);
      if (failure) {
        alert("Não foi possível salvar: " + failure);
        return;
      }
      origRows[id] = Object.assign({}, orig, changes);
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

  function paymentText(order) {
    if (order.payment_method === "cartao") {
      return "Cartão de " + (order.card_type === "credito" ? "crédito" : order.card_type === "debito" ? "débito" : "—");
    }
    if (order.payment_method === "pix") return "Pix";
    if (order.payment_method === "dinheiro") {
      if (order.change_for != null) {
        var change = Number(order.change_for) - Number(order.total);
        return "Dinheiro — troco para " + formatBRL(order.change_for) + " (troco de " + formatBRL(change) + ")";
      }
      return "Dinheiro — sem troco";
    }
    return ""; // pedidos antigos, de antes de existir a forma de pagamento
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
      (Number(order.delivery_fee) > 0
        ? '<div class="order-meta" style="text-align:right">Taxa de entrega: ' + formatBRL(order.delivery_fee) + "</div>"
        : "") +
      '<div class="order-total">' + formatBRL(order.total) + "</div>" +
      (paymentText(order) ? '<div class="order-extra">Pagamento: ' + escapeHtml(paymentText(order)) + "</div>" : "") +
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
      var result = await client.from("orders").update({ status: newStatus }).eq("id", orderId).select("id");
      select.disabled = false;

      var failure = writeFailure(result);
      if (failure) {
        select.value = select.dataset.status; // volta pro que está de fato salvo (não deixa mostrando uma mentira)
        alert("Não foi possível mudar o status: " + failure);
        return;
      }
      select.dataset.status = newStatus;
      refreshStock(); // cancelar devolve o estoque / reativar desconta: atualiza o que está na tabela de produtos
    });
  }

  // ---------------- Resumo de vendas ----------------
  var SUMMARY_LIMIT = 1000; // teto de linhas por consulta do Supabase
  var CHART_PLOT_HEIGHT = 130; // px da área das barras
  var summaryDays = 7; // 1 = hoje, 7, 30, 0 = tudo
  var summaryRequest = 0; // descarta respostas antigas se o período mudar no meio da busca

  function pct(part, whole) {
    return whole ? Math.round((part / whole) * 100) : 0;
  }

  function chartHTML(daily) {
    var max = 0;
    daily.forEach(function (d) { if (d.revenue > max) max = d.revenue; });
    var step = Math.ceil(daily.length / 7);
    var peak = daily.reduce(function (best, d) { return d.revenue > best.revenue ? d : best; }, daily[0]);

    var cols = daily
      .map(function (d, i) {
        var h = d.revenue > 0 ? Math.max(3, Math.round((d.revenue / max) * CHART_PLOT_HEIGHT)) : 2;
        var showLabel = i % step === 0 || i === daily.length - 1;
        var tip = d.label + " — " + d.count + (d.count === 1 ? " pedido" : " pedidos") + " — " + formatBRL(d.revenue);
        return (
          '<div class="bar-col" title="' + tip + '">' +
          '<div class="bar-track"><div class="bar' + (d.revenue > 0 ? "" : " zero") + '" style="height:' + h + 'px"></div></div>' +
          '<span class="bar-label">' + (showLabel ? d.label : "") + "</span>" +
          "</div>"
        );
      })
      .join("");

    return (
      '<div class="summary-card">' +
      "<h3>Faturamento por dia</h3>" +
      '<div class="chart" role="img" aria-label="Faturamento por dia">' + cols + "</div>" +
      (max > 0 ? '<p class="summary-footnote">Melhor dia: ' + peak.label + " — " + formatBRL(peak.revenue) + "</p>" : "") +
      "</div>"
    );
  }

  function topProductsHTML(top) {
    if (top.length === 0) return "<p class=\"summary-footnote\">Sem itens vendidos no período.</p>";
    var maxQty = top[0].qty;
    return (
      '<ol class="top-list">' +
      top
        .map(function (p) {
          return (
            '<li class="top-row">' +
            '<div class="line"><span>' + escapeHtml(p.name) + '</span><span class="qty">' + p.qty + " un. · " + formatBRL(p.revenue) + "</span></div>" +
            '<div class="meter"><span style="width:' + pct(p.qty, maxQty) + '%"></span></div>' +
            "</li>"
          );
        })
        .join("") +
      "</ol>"
    );
  }

  function renderSummary(stats, truncated, totalFetched) {
    if (totalFetched === 0) {
      els.summaryBody.innerHTML = '<p class="empty-state">Nenhum pedido neste período.</p>';
      return;
    }

    var deliveryTotal = stats.delivery.retirada + stats.delivery.entrega;
    var kpis =
      '<div class="kpi-grid">' +
      '<div class="kpi"><div class="kpi-label">Faturamento</div><div class="kpi-value accent">' + formatBRL(stats.revenue) + "</div>" +
      '<div class="kpi-note">produtos, sem cancelados' +
      (stats.deliveryFees > 0 ? " · mais " + formatBRL(stats.deliveryFees) + " de taxas de entrega" : "") +
      "</div></div>" +
      '<div class="kpi"><div class="kpi-label">Pedidos</div><div class="kpi-value">' + stats.ordersCount + "</div>" +
      (stats.cancelledCount > 0
        ? '<div class="kpi-note">' + stats.cancelledCount + (stats.cancelledCount === 1 ? " cancelado fora da conta" : " cancelados fora da conta") + "</div>"
        : "") +
      "</div>" +
      '<div class="kpi"><div class="kpi-label">Ticket médio</div><div class="kpi-value">' + formatBRL(stats.avgTicket) + "</div></div>" +
      '<div class="kpi"><div class="kpi-label">Novos (sem confirmar)</div><div class="kpi-value">' + stats.pendingCount + "</div></div>" +
      "</div>";

    var side =
      '<div class="summary-card">' +
      "<h3>Mais vendidos</h3>" + topProductsHTML(stats.topProducts) +
      '<h3 style="margin-top:22px">Retirada ou entrega</h3>' +
      '<div class="split">' +
      '<div class="line"><span>Retirada</span><span>' + stats.delivery.retirada + " (" + pct(stats.delivery.retirada, deliveryTotal) + "%)</span></div>" +
      '<div class="line"><span>Entrega</span><span>' + stats.delivery.entrega + " (" + pct(stats.delivery.entrega, deliveryTotal) + "%)</span></div>" +
      "</div></div>";

    var hasChart = stats.daily.length > 0;
    els.summaryBody.innerHTML =
      kpis +
      '<div class="summary-grid' + (hasChart ? "" : " single") + '">' + (hasChart ? chartHTML(stats.daily) : "") + side + "</div>" +
      (truncated
        ? '<p class="summary-footnote">Mostrando só os ' + SUMMARY_LIMIT + " pedidos mais recentes do período — escolha um período menor para ver tudo.</p>"
        : "");
  }

  async function loadSummary() {
    var myRequest = ++summaryRequest;
    var days = summaryDays; // o período deste pedido (summaryDays pode mudar antes da resposta chegar)
    els.summaryBody.innerHTML = '<p class="empty-state">Carregando resumo…</p>';

    var now = new Date();
    var start = PM.Stats.periodStart(days, now);
    var query = client
      .from("orders")
      .select("status, total, delivery_fee, delivery_type, created_at, order_items(product_name, quantity, subtotal)");
    if (start) query = query.gte("created_at", start.toISOString());
    var result = await query.order("created_at", { ascending: false }).limit(SUMMARY_LIMIT);

    if (myRequest !== summaryRequest) return; // chegou uma resposta mais nova enquanto esta ainda carregava
    if (result.error) {
      els.summaryBody.innerHTML = '<p class="empty-state">Erro ao carregar o resumo.</p>';
      return;
    }

    // "Hoje" não tem gráfico (seria uma barra só); "Tudo" mostra os últimos 30 dias.
    var chartDays = days === 1 ? 0 : days || 30;
    var stats = PM.Stats.compute(result.data, { now: now, chartDays: chartDays });
    renderSummary(stats, result.data.length >= SUMMARY_LIMIT, result.data.length);
  }

  function bindSummary() {
    els.periodBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        summaryDays = Number(btn.dataset.days);
        els.periodBtns.forEach(function (b) { b.classList.toggle("active", b === btn); });
        loadSummary();
      });
    });
    els.refreshSummary.addEventListener("click", loadSummary);
    els.refreshOrders.addEventListener("click", loadOrders);
  }

  // ---------------- Configurações da loja: Especial e Loja ----------------
  function cap(str) { return str.charAt(0).toUpperCase() + str.slice(1); }
  function nowDate() { return new Date(); }
  function moneyInput(v) { return Number(v).toFixed(2).replace(".", ","); }

  /** Mensagem curta ao lado do botão. "ok" some sozinha; erro fica até a próxima ação. */
  function flash(el, text, kind) {
    el.textContent = text;
    el.className = "msg" + (kind ? " " + kind : "");
    clearTimeout(msgTimers[el.id]);
    if (kind === "ok") {
      msgTimers[el.id] = setTimeout(function () { el.textContent = ""; el.className = "msg"; }, 4000);
    }
  }

  function saveSetting(key, value) {
    return client.from("settings").upsert({ key: key, value: value }, { onConflict: "key" }).select("key");
  }

  async function loadFlavors() {
    var res = await client
      .from("special_flavors")
      .select("id, name, available, sort_order")
      .order("sort_order")
      .order("id");
    flavorsOk = !res.error;
    flavors = flavorsOk ? res.data : [];
  }

  async function loadStoreSettings() {
    var results = await Promise.all([client.from("settings").select("key, value"), loadFlavors()]);
    var setRes = results[0];
    settingsOk = !setRes.error;
    if (settingsOk) {
      var raw = {};
      setRes.data.forEach(function (r) { raw[r.key] = r.value; });
      settings = PM.Store.normalizeSettings(raw);
    }
    renderSpecial();
    renderStore();
  }

  // ----- Especial: abertura -----
  function renderSpecialStatus() {
    if (!settingsOk) {
      els.specialStatus.textContent = "Não foi possível ler as configurações. Atualize a página antes de mexer aqui.";
      return;
    }
    var parts = PM.Store.belemParts(nowDate());
    var open = PM.Store.isSpecialOpen(settings, nowDate());
    els.specialStatus.textContent =
      "Hoje é " + PM.Store.DAY_FULL[parts.dow] + ". O especial está " + (open ? "aberto" : "fechado") + " para pedidos no site.";
  }

  function renderSunday() {
    var sunday = PM.Store.upcomingSunday(nowDate());
    var today = PM.Store.belemParts(nowDate()).dateKey;
    els.sundayLabel.textContent =
      (sunday === today ? "Abrir o especial neste domingo (hoje, " : "Abrir o especial no próximo domingo (") +
      PM.Store.formatDayMonth(sunday) + ")";
    els.sundayToggle.checked = settingsOk && settings.special_sunday_date === sunday;
    els.sundayToggle.disabled = !settingsOk;
  }

  async function handleSundayToggle() {
    if (!settingsOk) return;
    var sunday = PM.Store.upcomingSunday(nowDate());
    var wanted = els.sundayToggle.checked ? sunday : null;

    els.sundayToggle.disabled = true;
    var result = await saveSetting("special_sunday_date", wanted);
    els.sundayToggle.disabled = false;

    var failure = writeFailure(result);
    if (failure) {
      els.sundayToggle.checked = !els.sundayToggle.checked; // volta pro que está de fato salvo
      flash(els.sundayMsg, "Não foi possível salvar: " + failure, "error");
      return;
    }
    settings.special_sunday_date = wanted;
    renderSpecialStatus();
    flash(
      els.sundayMsg,
      wanted ? "Especial liberado para o domingo " + PM.Store.formatDayMonth(wanted) + "." : "Domingo fechado para o especial.",
      "ok"
    );
  }

  // ----- Especial: sabores -----
  function flavorRowHTML(f) {
    return (
      '<li class="flavor-admin-row" data-id="' + f.id + '">' +
      '<input type="text" maxlength="60" data-field="name" value="' + escapeAttr(f.name) + '" aria-label="Nome do sabor">' +
      '<label class="check-row"><input type="checkbox" data-field="available"' + (f.available ? " checked" : "") + "> Disponível</label>" +
      '<button class="btn btn-primary btn-sm" data-act="save">Salvar</button>' +
      '<button class="btn btn-ghost btn-sm" data-act="delete">Remover</button>' +
      "</li>"
    );
  }

  function renderFlavors() {
    if (!flavorsOk) {
      els.flavorList.innerHTML = '<li class="empty-state">Não foi possível carregar os sabores. Atualize a página.</li>';
    } else if (flavors.length === 0) {
      els.flavorList.innerHTML = '<li class="empty-state">Nenhum sabor cadastrado. Adicione abaixo.</li>';
    } else {
      els.flavorList.innerHTML = flavors.map(flavorRowHTML).join("");
    }
    els.flavorNewName.disabled = !flavorsOk;
    els.flavorClear.disabled = !flavorsOk;
  }

  function renderSpecial() {
    renderSpecialStatus();
    renderSunday();
    renderFlavors();
  }

  async function saveFlavor(li) {
    var id = Number(li.dataset.id);
    var name = li.querySelector('[data-field="name"]').value.trim();
    var available = li.querySelector('[data-field="available"]').checked;
    if (!name) {
      flash(els.flavorMsg, "O nome do sabor não pode ficar em branco.", "error");
      return;
    }
    var result = await client.from("special_flavors").update({ name: name, available: available }).eq("id", id).select("id");
    var failure = writeFailure(result);
    if (failure) {
      flash(els.flavorMsg, "Não foi possível salvar: " + failure, "error");
      return;
    }
    var cached = flavors.find(function (f) { return f.id === id; });
    if (cached) { cached.name = name; cached.available = available; }
    li.classList.add("row-saved");
    setTimeout(function () { li.classList.remove("row-saved"); }, 1200);
    flash(els.flavorMsg, available ? "Sabor salvo." : "Sabor salvo como esgotado.", "ok");
  }

  async function deleteFlavor(li) {
    var id = Number(li.dataset.id);
    var name = li.querySelector('[data-field="name"]').value.trim() || "este sabor";
    if (!window.confirm('Remover o sabor "' + name + '"?')) return;
    var result = await client.from("special_flavors").delete().eq("id", id).select("id");
    var failure = writeFailure(result);
    if (failure) {
      flash(els.flavorMsg, "Não foi possível remover: " + failure, "error");
      return;
    }
    flavors = flavors.filter(function (f) { return f.id !== id; });
    li.remove();
    if (flavors.length === 0) renderFlavors();
    flash(els.flavorMsg, "Sabor removido.", "ok");
  }

  async function handleAddFlavor(e) {
    e.preventDefault();
    var name = els.flavorNewName.value.trim();
    if (!name) {
      flash(els.flavorMsg, "Digite o nome do sabor.", "error");
      els.flavorNewName.focus();
      return;
    }
    var nextOrder = flavors.reduce(function (m, f) { return Math.max(m, f.sort_order || 0); }, 0) + 1;
    var result = await client
      .from("special_flavors")
      .insert({ name: name, available: true, sort_order: nextOrder })
      .select("id");
    var failure = writeFailure(result);
    if (failure) {
      flash(els.flavorMsg, "Não foi possível adicionar: " + failure, "error");
      return;
    }
    els.flavorNewName.value = "";
    await loadFlavors();
    renderFlavors();
    flash(els.flavorMsg, "Sabor adicionado. Já aparece no site.", "ok");
    els.flavorNewName.focus();
  }

  async function handleClearFlavors() {
    if (flavors.length === 0) {
      flash(els.flavorMsg, "Não há sabores para remover.", "error");
      return;
    }
    if (!window.confirm("Remover todos os " + flavors.length + " sabores? Isso não pode ser desfeito.")) return;
    var result = await client.from("special_flavors").delete().gt("id", 0).select("id");
    var failure = writeFailure(result);
    if (failure) {
      flash(els.flavorMsg, "Não foi possível remover: " + failure, "error");
      return;
    }
    await loadFlavors();
    renderFlavors();
    flash(els.flavorMsg, "Lista de sabores esvaziada.", "ok");
  }

  // ----- Loja: taxa e horários -----
  function renderStoreStatus() {
    if (!settingsOk) {
      els.storeStatus.textContent = "Não foi possível ler as configurações. Atualize a página antes de editar.";
      return;
    }
    els.storeStatus.textContent =
      "Agora no site: " + PM.Store.statusText(PM.Store.openStatus(settings.opening_hours, nowDate()));
  }

  function hoursRowHTML(d) {
    var h = settings.opening_hours[d];
    return (
      '<div class="hours-row" data-dow="' + d + '">' +
      '<span class="day">' + cap(PM.Store.DAY_FULL[d]) + "</span>" +
      '<label class="check-row"><input type="checkbox" data-field="closed"' + (h.closed ? " checked" : "") + "> Fechado</label>" +
      '<input type="time" data-field="open" value="' + h.open + '"' + (h.closed ? " disabled" : "") + ' aria-label="Abre">' +
      "<span>às</span>" +
      '<input type="time" data-field="close" value="' + h.close + '"' + (h.closed ? " disabled" : "") + ' aria-label="Fecha">' +
      "</div>"
    );
  }

  // ----- Loja: Pix -----
  function renderPix() {
    var pix = settings.pix;
    var off = !settingsOk;
    els.pixType.innerHTML =
      '<option value="">Escolha o tipo…</option>' +
      PM.Pix.KEY_TYPES.map(function (t) { return '<option value="' + t.id + '">' + t.label + "</option>"; }).join("");
    els.pixType.value = pix ? pix.key_type : "";
    els.pixKey.value = pix ? pix.key : "";
    els.pixName.value = pix ? pix.name : "";
    els.pixCity.value = pix ? pix.city : "";
    els.pixTestCode.classList.add("hidden");
    els.pixTestHint.classList.add("hidden");
    [els.pixType, els.pixKey, els.pixName, els.pixCity, els.pixSave, els.pixTest, els.pixRemove].forEach(function (el) {
      el.disabled = off;
    });
  }

  /** Lê o formulário do Pix. Devolve { value } ou { error }. */
  function readPix() {
    var norm = PM.Pix.normalizeKey(els.pixType.value, els.pixKey.value);
    if (norm.error) return { error: norm.error };
    var name = PM.Pix.clean(els.pixName.value, 25);
    var city = PM.Pix.clean(els.pixCity.value, 15);
    if (!name) return { error: "Informe o nome do recebedor, como está na conta." };
    if (!city) return { error: "Informe a cidade." };
    return { value: { key: norm.key, key_type: els.pixType.value, name: name, city: city } };
  }

  async function savePix() {
    if (!settingsOk) return;
    var read = readPix();
    if (read.error) {
      flash(els.pixMsg, read.error, "error");
      return;
    }
    els.pixSave.disabled = true;
    var result = await saveSetting("pix", read.value);
    els.pixSave.disabled = false;

    var failure = writeFailure(result);
    if (failure) {
      flash(els.pixMsg, "Não foi possível salvar: " + failure, "error");
      return;
    }
    settings.pix = read.value;
    renderPix();
    flash(els.pixMsg, "Pix salvo. O cliente verá: " + read.value.name + " — " + read.value.city + ".", "ok");
  }

  /** Gera um código de R$ 1,00 pra ela colar no app do banco e conferir nome e valor, sem pagar. */
  function testPix() {
    if (!settingsOk) return;
    var read = readPix();
    if (read.error) {
      flash(els.pixMsg, read.error, "error");
      return;
    }
    els.pixTestCode.value = PM.Pix.payload({ key: read.value.key, name: read.value.name, city: read.value.city, amount: 1 });
    els.pixTestCode.classList.remove("hidden");
    els.pixTestHint.classList.remove("hidden");
    flash(els.pixMsg, "Código de teste gerado (não foi salvo nada).", "ok");
  }

  async function removePix() {
    if (!settingsOk) return;
    if (!settings.pix) {
      flash(els.pixMsg, "Não há Pix cadastrado.", "error");
      return;
    }
    if (!window.confirm("Remover o Pix? Os clientes que escolherem Pix vão receber a chave pelo WhatsApp.")) return;
    var result = await saveSetting("pix", null);
    var failure = writeFailure(result);
    if (failure) {
      flash(els.pixMsg, "Não foi possível remover: " + failure, "error");
      return;
    }
    settings.pix = null;
    renderPix();
    flash(els.pixMsg, "Pix removido.", "ok");
  }

  function renderStore() {
    renderPix();
    renderStoreStatus();
    els.feeInput.disabled = !settingsOk;
    els.feeSave.disabled = !settingsOk;
    els.hoursSave.disabled = !settingsOk;
    if (!settingsOk) {
      els.hoursEditor.innerHTML = "";
      return;
    }
    els.feeInput.value = moneyInput(settings.delivery_fee);
    els.hoursEditor.innerHTML = PM.Store.WEEK_ORDER.map(hoursRowHTML).join("");
  }

  async function saveFee() {
    if (!settingsOk) return;
    var value = PM.Store.parseMoney(els.feeInput.value);
    if (isNaN(value)) {
      flash(els.feeMsg, "Digite um valor em reais, por exemplo 8,00.", "error");
      return;
    }
    if (value > 500) {
      flash(els.feeMsg, "Valor alto demais: o máximo é R$ 500,00.", "error");
      return;
    }
    els.feeSave.disabled = true;
    var result = await saveSetting("delivery_fee", value);
    els.feeSave.disabled = false;

    var failure = writeFailure(result);
    if (failure) {
      flash(els.feeMsg, "Não foi possível salvar: " + failure, "error");
      return;
    }
    settings.delivery_fee = value;
    els.feeInput.value = moneyInput(value);
    flash(els.feeMsg, "Taxa salva: " + formatBRL(value) + ". Vale para os próximos pedidos.", "ok");
  }

  /** Lê os 7 dias do editor. Devolve { hours } ou { error } (nada é salvo se algum dia estiver errado). */
  function readHours() {
    var hours = {};
    var error = null;
    PM.Store.WEEK_ORDER.forEach(function (d) {
      var row = els.hoursEditor.querySelector('.hours-row[data-dow="' + d + '"]');
      var closed = row.querySelector('[data-field="closed"]').checked;
      var open = row.querySelector('[data-field="open"]').value;
      var close = row.querySelector('[data-field="close"]').value;
      var o = PM.Store.parseTime(open);
      var c = PM.Store.parseTime(close);
      var valid = !isNaN(o) && !isNaN(c) && o < c;

      if (!closed && !valid && !error) {
        error = isNaN(o) || isNaN(c)
          ? cap(PM.Store.DAY_FULL[d]) + ": preencha o horário de abrir e de fechar."
          : cap(PM.Store.DAY_FULL[d]) + ": o horário de fechar precisa ser depois do de abrir.";
      }
      var fallback = PM.Store.DEFAULTS.opening_hours[d];
      hours[d] = valid
        ? { open: open, close: close, closed: closed }
        : { open: fallback.open, close: fallback.close, closed: closed };
    });
    return error ? { error: error } : { hours: hours };
  }

  async function saveHours() {
    if (!settingsOk) return;
    var read = readHours();
    if (read.error) {
      flash(els.hoursMsg, read.error, "error");
      return;
    }
    els.hoursSave.disabled = true;
    var result = await saveSetting("opening_hours", read.hours);
    els.hoursSave.disabled = false;

    var failure = writeFailure(result);
    if (failure) {
      flash(els.hoursMsg, "Não foi possível salvar: " + failure, "error");
      return;
    }
    settings.opening_hours = PM.Store.normalizeSettings({ opening_hours: read.hours }).opening_hours;
    renderStoreStatus();
    flash(els.hoursMsg, "Horários salvos. O site já mostra o novo horário.", "ok");
  }

  function bindStore() {
    els.sundayToggle.addEventListener("change", handleSundayToggle);

    els.flavorList.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-act]");
      if (!btn) return;
      var li = btn.closest(".flavor-admin-row");
      if (btn.dataset.act === "save") saveFlavor(li);
      else if (btn.dataset.act === "delete") deleteFlavor(li);
    });
    els.flavorList.addEventListener("change", function (e) {
      if (e.target.matches('[data-field="available"]')) saveFlavor(e.target.closest(".flavor-admin-row"));
    });
    els.flavorList.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && e.target.matches('[data-field="name"]')) {
        e.preventDefault();
        saveFlavor(e.target.closest(".flavor-admin-row"));
      }
    });
    els.flavorAddForm.addEventListener("submit", handleAddFlavor);
    els.flavorClear.addEventListener("click", handleClearFlavors);

    els.pixSave.addEventListener("click", savePix);
    els.pixTest.addEventListener("click", testPix);
    els.pixRemove.addEventListener("click", removePix);

    els.feeSave.addEventListener("click", saveFee);
    els.feeInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") saveFee();
    });
    els.hoursSave.addEventListener("click", saveHours);
    els.hoursEditor.addEventListener("change", function (e) {
      if (!e.target.matches('[data-field="closed"]')) return;
      var row = e.target.closest(".hours-row");
      row.querySelectorAll('input[type="time"]').forEach(function (input) { input.disabled = e.target.checked; });
    });
  }

  function bindUI() {
    els.loginForm.addEventListener("submit", handleLogin);
    els.logoutBtn.addEventListener("click", handleLogout);
    bindTabs();
    bindProductsTable();
    bindOrdersList();
    bindSummary();
    bindStore();
  }

  function init() {
    client = window.supabase.createClient(PM.CONFIG.SUPABASE_URL, PM.CONFIG.SUPABASE_ANON_KEY);
    cacheEls();
    bindUI();
    client.auth.onAuthStateChange(function (_event, session) {
      if (session) {
        // O supabase-js pode reemitir o evento de login quando você volta pra aba.
        // Se o painel já está aberto, não recarrega nada — senão apagaria edições não salvas.
        if (els.appScreen.classList.contains("hidden")) showApp(session);
      } else {
        showLogin();
      }
    });
  }

  return { init: init };
})();

document.addEventListener("DOMContentLoaded", function () {
  PM.Admin.init();
});
