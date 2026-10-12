/**
 * hscroll.js
 * No celular, as listas que rolam pro lado (categorias, "queridinhos") se
 * resolvem com o dedo. No computador, sem trackpad, não havia como rolar.
 * Este módulo dá a elas, só quando o conteúdo realmente não cabe:
 *   - setas "‹" e "›" (só aparecem com mouse; o CSS esconde em telas de toque)
 *   - arrastar com o mouse (clicar e puxar)
 *
 * Marcação esperada:
 *   <div class="hscroll"><div class="scroller" data-hscroll>...</div></div>
 * O elemento com data-hscroll é o que rola; o pai (.hscroll) guarda as setas.
 */

PM.HScroll = (function () {
  var instances = [];
  var DRAG_THRESHOLD = 5; // px de movimento antes de contar como "arrastar" (senão é só um clique)

  function arrowSvg(direction) {
    var d = direction < 0 ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6";
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="' + d + '"/></svg>';
  }

  function enhance(scroller) {
    var wrapper = scroller.parentElement;
    if (!wrapper || scroller.dataset.hscrollReady) return null;
    scroller.dataset.hscrollReady = "1";

    var prev = document.createElement("button");
    prev.type = "button";
    prev.className = "hscroll-btn prev";
    prev.setAttribute("aria-label", "Rolar para a esquerda");
    prev.innerHTML = arrowSvg(-1);

    var next = document.createElement("button");
    next.type = "button";
    next.className = "hscroll-btn next";
    next.setAttribute("aria-label", "Rolar para a direita");
    next.innerHTML = arrowSvg(1);

    wrapper.appendChild(prev);
    wrapper.appendChild(next);

    function update() {
      var max = scroller.scrollWidth - scroller.clientWidth;
      wrapper.classList.toggle("is-overflowing", max > 1);
      wrapper.classList.toggle("at-start", scroller.scrollLeft <= 1);
      wrapper.classList.toggle("at-end", scroller.scrollLeft >= max - 1);
    }

    function scrollByPage(direction) {
      var amount = direction * Math.max(200, scroller.clientWidth * 0.8);
      if (typeof scroller.scrollBy === "function") scroller.scrollBy({ left: amount, behavior: "smooth" });
      else scroller.scrollLeft += amount;
    }

    prev.addEventListener("click", function () { scrollByPage(-1); });
    next.addEventListener("click", function () { scrollByPage(1); });
    scroller.addEventListener("scroll", update);

    // ---- arrastar com o mouse (toque continua com a rolagem nativa) ----
    var drag = null;
    var suppressClick = false;

    scroller.addEventListener("pointerdown", function (e) {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      drag = { startX: e.clientX, startLeft: scroller.scrollLeft, moved: false };
    });

    window.addEventListener("pointermove", function (e) {
      if (!drag || e.pointerType !== "mouse") return;
      var dx = e.clientX - drag.startX;
      if (!drag.moved && Math.abs(dx) > DRAG_THRESHOLD) {
        drag.moved = true;
        scroller.classList.add("is-dragging");
      }
      if (drag.moved) scroller.scrollLeft = drag.startLeft - dx;
    });

    function endDrag() {
      if (!drag) return;
      var moved = drag.moved;
      drag = null;
      scroller.classList.remove("is-dragging");
      if (moved) {
        // quem arrastou não quis clicar no botão que estava embaixo do mouse
        suppressClick = true;
        setTimeout(function () { suppressClick = false; }, 0);
      }
    }
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);

    scroller.addEventListener("click", function (e) {
      if (suppressClick) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);

    scroller.addEventListener("dragstart", function (e) { e.preventDefault(); });

    if (typeof ResizeObserver === "function") new ResizeObserver(update).observe(scroller);

    var instance = { scroller: scroller, update: update };
    instances.push(instance);
    update();
    return instance;
  }

  function init() {
    document.querySelectorAll("[data-hscroll]").forEach(enhance);
    window.addEventListener("resize", refresh);
  }

  /** Reavalia se cada lista ainda rola (chamar depois de mudar o conteúdo). */
  function refresh() {
    instances.forEach(function (i) { i.update(); });
  }

  return { init: init, refresh: refresh, enhance: enhance };
})();
