/**
 * products.js
 * Fonte dos dados de catálogo. Até a Fase 5, PM.PRODUCTS/PM.CATEGORIES eram
 * um array fixo escrito à mão aqui. Agora eles vêm do Supabase: a função
 * PM.loadCatalog() busca categorias e produtos reais e preenche os mesmos
 * dois arrays, no mesmo formato de sempre — então cart.js, menu.js e
 * whatsapp.js não precisaram mudar nada.
 *
 * PM.PRODUCTS começa vazio e só é preenchido depois que loadCatalog()
 * termina (chamado em app.js antes de qualquer outro módulo iniciar).
 */

window.PM = window.PM || {};

PM.CATEGORIES = [];
PM.PRODUCTS = [];

// Ícones de linha usados como moldura enquanto um produto não tem foto real
// (campo "image_url" vazio no banco). Isso é só visual, por isso continua
// fixo aqui em vez de vir do banco.
PM.ICONS = {
  morangos:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M12 8c-4 0-7 2.6-7 7 0 3.4 3.2 6 7 6s7-2.6 7-6c0-4.4-3-7-7-7Z"/><path d="M9 3.5 12 8l3-4.5"/><circle cx="9.5" cy="13" r=".6" fill="currentColor"/><circle cx="13" cy="12" r=".6" fill="currentColor"/><circle cx="11" cy="17" r=".6" fill="currentColor"/><circle cx="14.5" cy="16" r=".6" fill="currentColor"/></svg>',
  brownies:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="4.5" y="6.5" width="15" height="11" rx="1.5"/><path d="M4.5 11c3 2 12 2 15 0"/><path d="M8 15.2h.01M12 16h.01M16 15.2h.01" stroke-width="2" stroke-linecap="round"/></svg>',
  bolos:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M4 20V12a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v8"/><path d="M4 20h16"/><path d="M4 15.5h16"/><path d="M12 9V5.5"/><path d="M12 5.5c-.9 0-1.6-.7-1.6-1.5S11.1 2.5 12 2.5s1.6.7 1.6 1.5S12.9 5.5 12 5.5Z"/></svg>',
  doces:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M8.5 12a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0Z"/><path d="M6.5 9 3 7.5m3.5 9L3 18M17.5 9 21 7.5m-3.5 9 3.5 1.5"/></svg>',
  outros:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M12 3v3M12 18v3M4.2 7.2 6.3 9M17.7 15l2.1 1.8M3 12h3M18 12h3M4.2 16.8 6.3 15M17.7 9l2.1-1.8"/><circle cx="12" cy="12" r="3.2"/></svg>'
};

/** Busca um produto pelo id dentro do catálogo já carregado. */
PM.findProduct = function (id) {
  for (var i = 0; i < PM.PRODUCTS.length; i++) {
    if (PM.PRODUCTS[i].id === id) return PM.PRODUCTS[i];
  }
  return null;
};

/**
 * Busca categorias e produtos no Supabase e preenche PM.CATEGORIES/PM.PRODUCTS.
 * Retorna uma Promise — chame com `await` antes de iniciar os outros módulos.
 */
/* SUPABASE_FETCH_START */
PM.loadCatalog = async function () {
  var client = window.supabase.createClient(PM.CONFIG.SUPABASE_URL, PM.CONFIG.SUPABASE_ANON_KEY);
  PM.client = client; // outros módulos (ex: whatsapp.js, no passo 3) vão reusar essa conexão

  var catResult = await client.from("categories").select("slug, label").order("sort_order");
  if (catResult.error) throw catResult.error;

  var prodResult = await client
    .from("products")
    .select("id, name, description, price, image_url, featured, cat:categories(slug)")
    .eq("available", true)
    .order("id");
  if (prodResult.error) throw prodResult.error;

  PM.CATEGORIES = [{ id: "todos", label: "Todos" }].concat(
    catResult.data.map(function (c) {
      return { id: c.slug, label: c.label };
    })
  );

  PM.PRODUCTS = prodResult.data.map(function (p) {
    return {
      id: p.id,
      name: p.name,
      desc: p.description,
      price: p.price,
      cat: p.cat ? p.cat.slug : null,
      image: p.image_url || undefined,
      featured: p.featured
    };
  });
};
/* SUPABASE_FETCH_END */
