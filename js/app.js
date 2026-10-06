/**
 * app.js
 * Ponto de entrada. A partir da Fase 5, o catálogo não é mais instantâneo
 * (vem de uma chamada de rede ao Supabase), então a ordem importa mais do
 * que antes:
 *   1. WhatsApp.init()  — só liga o formulário, não depende do catálogo
 *   2. loadCatalog()    — busca produtos/categorias (mostra "carregando")
 *   3. Cart.init()      — só agora dá pra resolver os produtos salvos no carrinho
 *   4. Menu.init()      — só agora dá pra desenhar a grade de produtos
 */
document.addEventListener("DOMContentLoaded", async function () {
  PM.WhatsApp.init();

  var grid = document.getElementById("productGrid");
  var feat = document.getElementById("featScroller");
  if (grid) grid.innerHTML = '<p class="menu-loading">Carregando cardápio…</p>';
  if (feat) feat.innerHTML = "";

  try {
    await PM.loadCatalog();
  } catch (err) {
    console.error("Falha ao carregar cardápio do Supabase:", err);
    if (grid) {
      grid.innerHTML =
        '<p class="menu-error">Não foi possível carregar o cardápio agora. ' +
        "Puxe a página pra baixo ou recarregue em alguns segundos.</p>";
    }
    return;
  }

  PM.Cart.init();
  PM.Menu.init();
});
