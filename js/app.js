/**
 * app.js
 * Ponto de entrada. O catálogo vem de uma chamada de rede ao Supabase, então
 * a ordem importa:
 *   1. WhatsApp.init() e HScroll.init() — só ligam botões, não dependem do catálogo
 *   2. loadCatalog()  — busca produtos, categorias, configurações e sabores
 *   3. Cart.init()    — só agora dá pra resolver (e conferir) o carrinho salvo
 *   4. Menu.init() e Hours.init() — só agora dá pra desenhar cardápio e horários
 */

var REFRESH_AFTER_MS = 5 * 60 * 1000;

document.addEventListener("DOMContentLoaded", async function () {
  PM.WhatsApp.init();
  PM.HScroll.init();

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
  PM.Hours.init();

  // Quem deixa a aba aberta por horas (ou volta nela depois) pode estar vendo sabores,
  // preços ou horários desatualizados. Ao voltar pra aba, recarrega — mas só se já faz um tempo.
  var lastLoad = Date.now();
  var refreshing = false;
  document.addEventListener("visibilitychange", async function () {
    if (document.hidden || refreshing || Date.now() - lastLoad < REFRESH_AFTER_MS) return;
    refreshing = true;
    try {
      await PM.loadCatalog();
      lastLoad = Date.now();
      PM.Cart.prune(); // tira do carrinho o que saiu do ar enquanto a aba estava parada
      PM.Cart.render();
      PM.Menu.renderAll();
      PM.Hours.render();
    } catch (err) {
      console.warn("Não foi possível atualizar o cardápio; mantendo o que já está na tela.", err);
    } finally {
      refreshing = false;
    }
  });
});
