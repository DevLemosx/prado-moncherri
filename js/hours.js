/**
 * hours.js
 * Mostra no site se a loja está aberta agora e a lista de horários, sempre a
 * partir das configurações salvas no painel (PM.SETTINGS.opening_hours) e do
 * relógio de Belém. Reavalia a cada 30 segundos, pra quem deixa a página
 * aberta ver o "Aberto agora" virar "Fechado" na hora certa.
 */

PM.Hours = (function () {
  var timer = null;

  function render() {
    var st = PM.Store.openStatus(PM.SETTINGS.opening_hours, new Date());
    var text = PM.Store.statusText(st);

    document.querySelectorAll("[data-open-status]").forEach(function (el) {
      el.classList.toggle("is-open", st.open);
      el.classList.toggle("is-closed", !st.open);
      el.querySelector(".txt").textContent = text;
      el.hidden = false;
    });

    var list = document.getElementById("hoursList");
    if (list) {
      list.innerHTML = PM.Store.groupHours(PM.SETTINGS.opening_hours)
        .map(function (g) {
          return "<li><span>" + PM.Store.escapeHtml(g.label) + "</span><span>" + PM.Store.escapeHtml(g.text) + "</span></li>";
        })
        .join("");
    }
  }

  function init() {
    render();
    if (!timer) timer = setInterval(render, 30000);
  }

  return { init: init, render: render };
})();
