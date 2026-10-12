# Prado Moncherri Doceria — site

Site vitrine + cardápio digital + carrinho + finalização via WhatsApp.
HTML, CSS e JavaScript puros — sem build, sem dependências, sem backend.

## Como testar localmente

Não precisa instalar nada. Só abrir `index.html` no navegador (duplo clique
ou arrastar pro Chrome/Firefox). Todos os caminhos são relativos, então
funciona direto do disco.

Se preferir rodar com um servidor local (opcional, mas evita qualquer
diferença de comportamento em relação ao ar publicado):

```bash
# Python já vem instalado na maioria dos sistemas
python3 -m http.server 8000
# depois abra http://localhost:8000
```

## Estrutura de pastas

```
prado-moncherri/
├── index.html            → site público (única página, com âncoras internas)
├── admin.html            → painel administrativo (sem link no site; login obrigatório)
├── css/
│   ├── style.css          → tokens de design, tipografia, layout base
│   ├── components.css     → botões, cards, pills, carrinho, drawer, modal
│   ├── responsive.css     → só as media queries (mobile-first)
│   └── admin.css          → estilos do painel
├── js/
│   ├── config.js          → URL e chave publicável do Supabase
│   ├── store.js           → regras da loja: fuso de Belém, aberto/fechado, especial, dinheiro
│   ├── pix.js             → código Pix "copia e cola" (BR Code) e validação da chave Pix
│   ├── products.js        → carrega produtos, categorias, configurações e sabores do Supabase
│   ├── cart.js             → carrinho (produto ou produto+sabor) + gaveta
│   ├── menu.js             → filtro por categoria, grade, destaques e o cartão do especial
│   ├── hscroll.js          → setas e "arrastar com o mouse" nas listas que rolam pro lado
│   ├── hours.js            → "Aberto agora / Fechado" e lista de horários
│   ├── whatsapp.js         → checkout: pagamento, taxa, grava o pedido (e desconta o estoque) e abre o WhatsApp
│   ├── app.js              → inicializa o site público
│   ├── stats.js            → cálculo das estatísticas de vendas (função pura)
│   └── admin.js            → lógica do painel (login, produtos, pedidos, resumo, especial, loja)
├── assets/
│   ├── logo/               → logo, favicon e ícone de tela inicial
│   ├── produtos/           → (vazio) fotos oficiais dos doces entram aqui
│   └── banners/            → (vazio) banners/imagens de destaque, se precisar
└── README.md
```

## Banco de dados (Fase 5 — passo 2)

O cardápio não é mais um array fixo em `products.js` — agora vem do Supabase
(projeto `prado-moncherri`, tabelas `categories` e `products`).

- `js/config.js` guarda a URL do projeto e a chave publicável. Essa chave é
  pública por design (fica protegida pelas políticas de RLS no banco, não
  por ser secreta) — pode ficar no repositório sem problema.
- `js/products.js` tem a função `PM.loadCatalog()`, que busca os dados e
  preenche `PM.CATEGORIES`/`PM.PRODUCTS` no mesmo formato de sempre — por
  isso `cart.js`, `menu.js` e `whatsapp.js` não precisaram mudar.
- `index.html` carrega o SDK do Supabase via CDN antes do `products.js`.
- `app.js` agora é assíncrono: mostra "Carregando cardápio…" enquanto busca,
  e uma mensagem de erro se a conexão falhar.
- Só produtos com `available = true` aparecem no site — é o campo que o
  futuro painel administrativo vai usar pra "esgotar" um produto.

Pra editar produto/preço/estoque por enquanto (antes do painel existir), dá
pra mexer direto na tabela `products` pelo editor do Supabase.

## Especial de Fatias (sábados e alguns domingos)

O produto "Especial de Fatias" é vendido **por sabor**: o cliente escolhe quantas
fatias de cada sabor da semana. Cada sabor vira uma linha própria no carrinho, no
WhatsApp e no histórico (ex.: `2x Especial de Fatias (sábado) — Chocolate`).

- **Quando abre:** todo sábado (o dia todo, no horário de Belém) e nos domingos
  que a dona liberar. Nos outros dias o cartão aparece com o aviso "Disponível
  aos sábados e em alguns domingos" e não dá pra pedir.
- **Painel → aba Especial:** a dona cadastra/edita/remove os sabores da semana,
  desmarca "Disponível" quando um acaba (aparece como "Esgotado" no site) e
  marca o domingo quando for fazer. A marcação vale **só para aquele domingo** e
  se desfaz sozinha — não precisa lembrar de desligar.
- **Carrinho:** se o cliente deixa o especial no carrinho e volta outro dia (ou o
  sabor esgota, ou vira o dia), o item sai do pedido e a pessoa é avisada.
- Para o produto ser tratado assim, ele precisa estar marcado com
  `has_flavors = true` na tabela `products` (já está no id 33).

## Pagamento, taxa de entrega e horário

- **Pagamento:** Dinheiro (com "troco para quanto?", opcional), Cartão
  (crédito ou débito) ou Pix (veja a seção Pix). Vai na mensagem do WhatsApp e no histórico. Pagar o valor
  exato conta como "sem troco"; troco menor que o total é recusado.
- **Taxa de entrega:** R$ 8,00 por padrão, só nos pedidos com entrega. A dona muda
  em **Painel → Loja**. A taxa fica registrada em cada pedido (se mudar depois,
  os pedidos antigos não mudam) e **não entra no faturamento** do Resumo — aparece
  à parte.
- **Entrega exige endereço** (a rua). Se não quiser essa regra, é só tirar a
  verificação em `validate()` no `js/whatsapp.js`.
- **Horário de funcionamento:** "Aberto agora · fecha às 22:00" / "Fechado · abre
  amanhã às 08:00" no topo do site e no card de contato, calculado pelo horário
  de **Belém** (não pelo relógio do aparelho do cliente). A dona edita os horários
  de cada dia (ou marca "Fechado") em **Painel → Loja**. Com a loja fechada o
  cliente ainda consegue pedir; o checkout só avisa que o pedido será visto
  quando abrirem.
- Os horários que aparecem no Google (`JSON-LD` no `<head>` do `index.html`) são
  fixos: se a dona mudar o horário de vez, atualize lá também.

## Rolagem com o mouse

Categorias e "queridinhos" ganham setas ‹ › e dá pra arrastar com o mouse, mas só
quando o conteúdo realmente não cabe na tela. No celular nada muda (o dedo já rola).

## Estoque (agora vale de verdade)

O campo **Estoque** de cada produto no painel agora funciona:

- **Vazio = não controla** (sempre disponível). **Um número = quantas unidades restam.**
- O site mostra **"Esgotado"** quando chega a 0, **"Restam N"** quando é 5 ou menos, e o botão **+** trava no limite.
- Cada pedido **desconta sozinho**. Quem desconta é o banco, numa função (`place_order`) que grava o
  pedido, os itens e o estoque **numa transação só**: se faltar estoque, nada é gravado e nada é enviado
  (o cliente vê o aviso, o carrinho é ajustado e ele confere e envia de novo). Dois clientes
  pedindo a última unidade ao mesmo tempo: só um passa.
- **Cancelar um pedido** no painel **devolve o estoque**. **Reativar** um pedido cancelado desconta de novo
  (e recusa se não houver mais estoque).
- O **Especial de Fatias**: o estoque do produto vale pra **soma de todos os sabores**.
- O painel só salva o que você **mudou** na linha, então um estoque que andou sozinho não é
  sobrescrito por um número velho da tela. Ao abrir a aba Produtos, os estoques que você não está
  editando são atualizados.
- Pedidos feitos **antes** do estoque existir não mexem no estoque se forem cancelados.

Cuidado: como o pedido desconta o estoque **na hora de registrar** (antes de a dona confirmar), um
pedido falso ou desistido segura unidades até alguém cancelar. Cancelar devolve na hora.

## Pix

Terceira forma de pagamento (Dinheiro, Cartão, **Pix**).

- **Painel → Loja → Pix:** a dona cadastra o **tipo e a chave**, o **nome do recebedor** e a **cidade**.
  A chave é conferida (CPF/CNPJ com dígito verificador, celular, e-mail, chave aleatória): erro de
  digitação numa chave Pix manda o dinheiro pra outra pessoa. O botão **"Gerar código de teste"**
  cria um código de R$ 1,00 pra ela colar no app do banco **sem pagar** e conferir o nome.
- **No site:** depois que o pedido é **registrado**, a tela "Quase lá!" mostra o valor, a chave, os
  botões **Copiar chave** e **Copiar Pix copia e cola** (código com o valor, inclusive a taxa de
  entrega, já preenchido) e o botão **Abrir o WhatsApp**. O código só aparece depois do registro de
  propósito: se o estoque recusasse o pedido, a pessoa não teria pago por algo que não existe.
- **Sem chave cadastrada**, o Pix continua disponível: o cliente é avisado que a chave vem pelo
  WhatsApp.
- A chave Pix fica **legível por quem abre o site** (é como QR code de balcão). Não é segredo.
- O Pix **não é conciliado**: o site não sabe se o cliente pagou. A dona confere o comprovante.

## Como o checkout envia o pedido

1. A aba do WhatsApp é aberta **no instante do clique** (em branco). Navegadores só deixam abrir
   aba direto de um toque; se esperássemos o banco responder, o Safari/iPhone poderia bloquear.
2. O pedido é gravado pelo banco. Faltou estoque: a aba é fechada e **nada é enviado**.
3. A aba recebe a mensagem e aparece a tela **"Quase lá!"** (com o Pix, se for o caso) e o botão
   **Abrir o WhatsApp**, caso o navegador tenha bloqueado a aba.
4. Se o registro falhar por rede, o WhatsApp abre mesmo assim (o cliente não fica sem pedir).

## Resumo de vendas (Fase 5 — passo 5)

Terceira aba do painel (`Resumo`), calculada a partir dos pedidos gravados no
histórico. Períodos: Hoje, 7 dias, 30 dias e Tudo. Mostra:

- **Faturamento**, **número de pedidos**, **ticket médio** e **pedidos novos
  sem confirmar**
- **Faturamento por dia** (gráfico de barras; "Hoje" não tem gráfico e
  "Tudo" mostra os últimos 30 dias)
- **Mais vendidos** (top 5 por quantidade) e a divisão **retirada × entrega**

Regras que valem saber:

- Pedidos **cancelados ficam fora** de faturamento, contagem, ticket médio,
  ranking e gráfico (aparecem só como aviso no cartão de pedidos).
- Os dias são contados no **horário do navegador** de quem abre o painel.
- O ranking agrupa pelo **nome gravado no pedido** (não pelo produto atual):
  se um produto for renomeado, as vendas antigas e novas aparecem separadas.
- O Supabase devolve no máximo 1000 linhas por consulta; se o período tiver
  mais que isso, o painel avisa que está mostrando só os 1000 mais recentes.
- Pedidos novos aparecem ao abrir a aba **Pedidos** ou **Resumo** (ou no
  botão "Atualizar"). A aba Produtos não recarrega sozinha, pra não perder
  edição que ainda não foi salva.

**Visitas ao site** (quantas pessoas acessaram, de onde vieram) *não* está
incluído: depende de uma ferramenta externa (ex.: Cloudflare Web Analytics,
Plausible, Google Analytics) e de uma conta criada pela dona do site. É só
colar o trecho de código da ferramenta escolhida no `<head>` do `index.html`.

## Painel administrativo (Fase 5 — passo 4)

Arquivo `admin.html` (+ `css/admin.css` + `js/admin.js`), separado do site
público e sem link nenhum apontando pra ele. Tem cinco abas — Produtos, Pedidos, Resumo, Especial e Loja (as duas últimas estão descritas acima):

- **Produtos** — tabela editável: nome, categoria, descrição, foto (URL),
  preço, estoque, disponível e destaque. Preço em branco = "sob consulta";
  estoque em branco = não controla estoque.
- **Pedidos** — lista com os itens de cada pedido e um seletor de status
  (novo → confirmado → em preparo → pronto → entregue → cancelado).

Quem pode entrar é controlado pelo Supabase Auth (login por e-mail/senha),
não por nada no código — as políticas de RLS já garantem que só um usuário
autenticado edita produtos ou lê/muda pedidos.

### Login de teste (temporário!)

Criei uma conta só pra você testar o painel agora:

```
E-mail: teste@pradomoncherri.com
Senha:  ue1l1fFeOWKhTD
```

**Troque isso antes de entregar pra proprietária.** O jeito certo: no painel
do Supabase → Authentication → Users, apague esse usuário de teste e crie um
novo com o e-mail e senha de verdade dela (ou peça pra ela mesma se
cadastrar, se preferir não saber a senha). Não reaproveite essa senha
temporária pra nada.

## Histórico de pedidos (Fase 5 — passo 3)

Todo pedido é gravado em `orders` + `order_items`. **Quem grava é a função `place_order` do
banco** (veja "Estoque" e "Como o checkout envia o pedido"): o visitante do site **não tem mais
permissão de inserir direto nas tabelas** (isso pularia o estoque), só de chamar essa função.

O `id` do pedido é gerado no navegador (`crypto.randomUUID()`): reenviar o mesmo pedido não o
duplica nem desconta o estoque duas vezes (o banco recusa o mesmo `id` de novo).

Depois de enviar, o carrinho e o formulário são limpos automaticamente.

## SEO e ícones (Fase 4)

Já feito em `index.html`:

- Favicon e ícone de tela inicial (`assets/logo/favicon.png` e `apple-touch-icon.png`,
  gerados a partir do logo).
- `theme-color`, Open Graph e Twitter Card (título, descrição, imagem).
- Dados estruturados (JSON-LD) do tipo `Bakery`, já com endereço, telefone,
  horário de funcionamento e Instagram reais.

Pendente até você ter o link final da Netlify/domínio:

- Descomentar e preencher a tag `<link rel="canonical">` no `<head>`.
- Trocar `og:image` de um caminho relativo para a URL completa
  (ex: `https://seudominio.com/assets/logo/apple-touch-icon.png`), senão o
  WhatsApp/Instagram não conseguem carregar a imagem ao compartilhar o link.

## Antes de publicar (Fase 3 e 4 do plano)

Já confirmados com a proprietária:

- [x] **WhatsApp**: `js/whatsapp.js` já usa o número real (+55 91 8605-6549).
- [x] **Endereço**: R. José Ferreira da Cunha, Paragominas - PA, 68626-701 —
      já está na seção "Contato" do `index.html`.
- [x] **Horário**: já está na seção "Contato", agrupado por dias com o
      mesmo funcionamento.
- [x] **Instagram**: card novo em "Contato" linkando para
      instagram.com/pradomoncheri.

Ainda pendentes:

1. **Fotos**: assim que a proprietária mandar, coloque o arquivo em
   `assets/produtos/` e preencha o campo `image` do produto correspondente em
   `js/products.js` (tem um exemplo comentado no topo do arquivo). A etiqueta
   "foto em breve" some sozinha assim que o campo existir — não precisa mexer
   em mais nada.
2. **Preços e descrições**: revisar o array `PM.PRODUCTS` em `js/products.js`
   com a proprietária.
3. **Testar**: abrir no iPhone e no Android antes de publicar, e simular um
   pedido completo até o WhatsApp abrir com a mensagem certa.
4. **Publicar**: como é só HTML/CSS/JS estático, dá pra subir direto na
   Netlify (arrastar a pasta no painel, ou conectar um repositório Git).

## Limites conhecidos

- **Pedido fora do horário:** é aceito (com aviso). Se preferir bloquear, é no
  `openCheckout()` do `js/whatsapp.js`.
- **Especial fora do dia:** não dá pra encomendar com antecedência (na quinta, p.ex.).
- **Pix:** não há conferência automática de pagamento (a dona confere o comprovante).
- **Estoque por sabor:** o especial tem um estoque só (soma dos sabores). Quantidade por sabor ainda não existe: use "Disponível" para esgotar um sabor.
- O Resumo conta os dias no horário do navegador de quem abre o painel.

## Fase 5 (evolução futura)

Quando quiser sair do array fixo em `products.js` e permitir que a
proprietária edite produtos sem mexer no código, a migração natural é para
o Supabase (tabelas `products`, `categories`, `orders`, `order_items`, como
já discutido) + um painel administrativo simples.
