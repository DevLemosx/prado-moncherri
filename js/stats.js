/**
 * stats.js
 * Cálculo das estatísticas de vendas do painel. Função pura: recebe a lista
 * de pedidos (com itens) e devolve números — não mexe em DOM nem em rede,
 * por isso dá pra testar sozinha.
 *
 * Regras:
 *  - Pedidos "cancelado" ficam FORA de faturamento, contagem, ticket médio,
 *    ranking e gráfico (só aparecem em `cancelledCount`).
 *  - A taxa de entrega NÃO entra no faturamento: faturamento = o que foi vendido em
 *    produtos (total - taxa). As taxas aparecem à parte em `deliveryFees`.
 *    Pedidos antigos, de antes da taxa existir, têm taxa 0.
 *  - Valores do Postgres chegam como texto ("35.50"), então tudo passa por Number().
 *  - Dias são contados no horário local do navegador de quem abre o painel.
 */

window.PM = window.PM || {};

PM.Stats = (function () {
  function pad(n) {
    return n < 10 ? "0" + n : "" + n;
  }

  function round2(x) {
    return Math.round(x * 100) / 100;
  }

  /** Chave "AAAA-MM-DD" no horário local. */
  function dayKey(d) {
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  /** 00:00 local do primeiro dia do período. days=1 => hoje; 0/null => sem limite (retorna null). */
  function periodStart(days, now) {
    if (!days) return null;
    var d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    d.setDate(d.getDate() - (days - 1));
    return d;
  }

  /**
   * @param {Array} orders  pedidos com { status, total, delivery_type, created_at, order_items: [{product_name, quantity, subtotal}] }
   * @param {Object} opts   { now: Date, chartDays: número de dias do gráfico (0 = sem gráfico) }
   */
  function compute(orders, opts) {
    opts = opts || {};
    var now = opts.now || new Date();
    var chartDays = opts.chartDays || 0;

    var valid = [];
    var cancelledCount = 0;
    var pendingCount = 0;
    orders.forEach(function (o) {
      if (o.status === "cancelado") {
        cancelledCount++;
        return;
      }
      if (o.status === "novo") pendingCount++;
      valid.push(o);
    });

    var revenue = 0;
    var deliveryFees = 0;
    var delivery = { retirada: 0, entrega: 0 };
    var products = {}; // product_name -> { name, qty, revenue }

    // valor dos produtos de um pedido (sem a taxa de entrega)
    function productsValue(o) {
      return (Number(o.total) || 0) - (Number(o.delivery_fee) || 0);
    }

    valid.forEach(function (o) {
      revenue += productsValue(o);
      deliveryFees += Number(o.delivery_fee) || 0;
      if (o.delivery_type === "entrega") delivery.entrega++;
      else delivery.retirada++;

      (o.order_items || []).forEach(function (i) {
        var p = products[i.product_name] || (products[i.product_name] = { name: i.product_name, qty: 0, revenue: 0 });
        p.qty += Number(i.quantity) || 0;
        p.revenue += Number(i.subtotal) || 0;
      });
    });

    var topProducts = Object.keys(products)
      .map(function (k) {
        return { name: products[k].name, qty: products[k].qty, revenue: round2(products[k].revenue) };
      })
      .sort(function (a, b) {
        return b.qty - a.qty || b.revenue - a.revenue || a.name.localeCompare(b.name);
      })
      .slice(0, 5);

    // Série diária (últimos `chartDays` dias, terminando hoje), com dias sem venda zerados.
    var daily = [];
    if (chartDays > 0) {
      var buckets = {};
      for (var n = chartDays - 1; n >= 0; n--) {
        var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - n);
        var key = dayKey(d);
        buckets[key] = { key: key, label: pad(d.getDate()) + "/" + pad(d.getMonth() + 1), count: 0, revenue: 0 };
        daily.push(buckets[key]);
      }
      valid.forEach(function (o) {
        var b = buckets[dayKey(new Date(o.created_at))];
        if (b) {
          b.count++;
          b.revenue += productsValue(o);
        }
      });
      daily.forEach(function (b) { b.revenue = round2(b.revenue); });
    }

    return {
      ordersCount: valid.length,
      revenue: round2(revenue),
      deliveryFees: round2(deliveryFees),
      avgTicket: valid.length ? round2(revenue / valid.length) : 0,
      pendingCount: pendingCount,
      cancelledCount: cancelledCount,
      delivery: delivery,
      topProducts: topProducts,
      daily: daily
    };
  }

  return { compute: compute, periodStart: periodStart, dayKey: dayKey };
})();
