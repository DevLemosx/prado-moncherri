/**
 * products.js
 * Fonte única dos dados: categorias, produtos e ícones-placeholder.
 * Nenhuma outra parte do app deve guardar dados de produto — só ler daqui.
 *
 * IMPORTANTE (Fase 3 — Conteúdo real):
 * - Preços vieram do catálogo do WhatsApp e precisam ser confirmados com a proprietária.
 * - "price: null" = produto sob consulta (sem preço fixo). A UI mostra "Perguntar no WhatsApp".
 * - Fotos: cada produto aceita um campo opcional "image". Coloque o arquivo em
 *   assets/produtos/ e aponte o caminho, por exemplo:
 *     { id: 1, name: "Morango Cravejado", cat: "morangos", price: 16,
 *       desc: "...", featured: true, image: "assets/produtos/morango-cravejado.jpg" }
 *   Assim que o campo "image" existir, a foto real aparece automaticamente no
 *   lugar do ícone e a etiqueta "foto em breve" some sozinha — não precisa
 *   mexer em mais nada.
 */

window.PM = window.PM || {};

PM.CATEGORIES = [
  { id: "todos", label: "Todos" },
  { id: "morangos", label: "Morangos" },
  { id: "brownies", label: "Brownies" },
  { id: "bolos", label: "Bolos" },
  { id: "doces", label: "Doces" },
  { id: "outros", label: "Especiais" }
];

// Ícones de linha usados como moldura enquanto não temos fotos reais dos produtos.
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

PM.PRODUCTS = [
  { id: 1, name: "Morango Cravejado", cat: "morangos", price: 16, desc: "Morango fresco coberto e finalizado à mão.", featured: true },
  { id: 2, name: "Morangos do Sucesso", cat: "morangos", price: 16, desc: "Combinação clássica que nunca sai de moda." },
  { id: 3, name: "Morango do Amor", cat: "morangos", price: 13, desc: "Docinho, brilhante e cheio de carinho." },
  { id: 4, name: "Morango do Amor de Maracujá", cat: "morangos", price: 14, desc: "Versão com toque cítrico de maracujá." },
  { id: 5, name: "Fatias Bombom de Morango Cravejado", cat: "morangos", price: 22, desc: "Fatia generosa, para dividir (ou não)." },
  { id: 6, name: "Bombom de Morango Ouro Branco", cat: "morangos", price: 16, desc: "Morango envolto em chocolate branco nobre." },

  { id: 7, name: "Brownie Recheado", cat: "brownies", price: 10, desc: "Massa densa e recheio surpresa no centro." },
  { id: 8, name: "Brownie Caramelizado", cat: "brownies", price: 22, desc: "Camada de caramelo cremoso por cima.", featured: true },
  { id: 9, name: "Fatias de Brownie", cat: "brownies", price: 17, desc: "Corte generoso, textura fudgy." },
  { id: 10, name: "Brigaderão de Brownie", cat: "brownies", price: 15, desc: "Brownie com cobertura de brigadeiro." },
  { id: 11, name: "Cake Brownie Rústico", cat: "brownies", price: 150, desc: "Bolo inteiro estilo brownie, para ocasiões especiais." },
  { id: 12, name: "Guirlanda de Brownie", cat: "brownies", price: 175, desc: "Peça decorativa para datas comemorativas." },
  { id: 13, name: "Felicidade Cherie de Brownie", cat: "brownies", price: 23, desc: "Combinação especial da casa." },

  { id: 14, name: "Cake no Pote", cat: "bolos", price: 15, desc: "Camadas de bolo e recheio, prontas pra colher.", featured: true },
  { id: 15, name: "Cake Vulcão Mini", cat: "bolos", price: 26, desc: "Centro derretido, porção individual.", featured: true },
  { id: 16, name: "Cake Vulcão", cat: "bolos", price: 65, desc: "A versão família do nosso vulcão de chocolate." },
  { id: 17, name: "Matilda Cake — fatia", cat: "bolos", price: 20, desc: "Inspirado no bolo mais famoso do cinema." },
  { id: 18, name: "Mini Cake de Cenoura", cat: "bolos", price: 26, desc: "Cenoura com cobertura de chocolate cremosa." },
  { id: 19, name: "Cake Amoroso", cat: "bolos", price: 45, desc: "Bolo especial para presentear." },
  { id: 20, name: "Cake no Acetato Matilda", cat: "bolos", price: 30, desc: "Acabamento em acetato, visual impecável." },
  { id: 21, name: "Cake na Marmita", cat: "bolos", price: 11, desc: "Porção individual, prática para o dia a dia." },
  { id: 22, name: "Naked Cake", cat: "bolos", price: 185, desc: "Bolo grande, ideal para celebrações." },
  { id: 23, name: "Pudim Tradicional", cat: "bolos", price: 50, desc: "Receita clássica, calda generosa." },

  { id: 24, name: "Trufas", cat: "doces", price: 3.5, desc: "Sabores variados — pergunte as opções do dia.", featured: true },
  { id: 25, name: "Cupcake Recheado", cat: "doces", price: 3.5, desc: "Massa fofinha com recheio surpresa." },
  { id: 26, name: "Cupcake com Chantilly", cat: "doces", price: 4, desc: "Finalizado com chantilly fresco." },
  { id: 27, name: "Brigad'Crème", cat: "doces", price: 4, desc: "Brigadeiro cremoso em nova versão." },
  { id: 28, name: "Palha Italiana", cat: "doces", price: 8, desc: "Crocante por fora, macia por dentro." },
  { id: 29, name: "Cone Trufado", cat: "doces", price: 8, desc: "Casquinha crocante com recheio trufado." },
  { id: 30, name: "Doces Especiais", cat: "doces", price: 140, desc: "Caixa especial para festas e eventos." },
  { id: 31, name: "Brigs Decorativos", cat: "doces", price: null, desc: "Peça decorativa sob encomenda — preço a combinar." },

  { id: 32, name: "Pudim em Pedaço", cat: "outros", price: 7, desc: "Porção individual do nosso pudim." },
  { id: 33, name: "Especial de Fatias (sábado)", cat: "outros", price: 20, desc: "Disponível aos sábados, sabor surpresa." },
  { id: 34, name: "Barra Suprema", cat: "outros", price: 22, desc: "Camadas generosas, para os mais gulosos." },
  { id: 35, name: "Crush Cake Feuilline", cat: "outros", price: 20, desc: "Crocância de feuilline com recheio cremoso." },
  { id: 36, name: "Cruschy Cake Ninho Chocolat", cat: "outros", price: 21, desc: "Leite Ninho e chocolate em camadas." },
  { id: 37, name: "Sobremesas de Natal", cat: "outros", price: 135, desc: "Linha especial de fim de ano — sob encomenda." }
];

/** Busca um produto pelo id. Retorna null se não existir. */
PM.findProduct = function (id) {
  for (var i = 0; i < PM.PRODUCTS.length; i++) {
    if (PM.PRODUCTS[i].id === id) return PM.PRODUCTS[i];
  }
  return null;
};
