/**
 * app.js
 * Ponto de entrada. Só chama o init() de cada módulo, na ordem certa:
 * o carrinho precisa existir antes do cardápio (que consulta as quantidades),
 * e o WhatsApp precisa existir antes de qualquer um dos dois poder usá-lo.
 */
document.addEventListener("DOMContentLoaded", function () {
  PM.WhatsApp.init();
  PM.Cart.init();
  PM.Menu.init();
});
