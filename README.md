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
├── index.html            → estrutura da página (única, com âncoras internas)
├── css/
│   ├── style.css          → tokens de design, tipografia, layout base
│   ├── components.css     → botões, cards, pills, carrinho, drawer, modal
│   └── responsive.css     → só as media queries (mobile-first)
├── js/
│   ├── products.js        → dados: produtos, categorias, ícones-placeholder
│   ├── cart.js             → estado do carrinho (add/remover/qtd/total) + UI da gaveta
│   ├── menu.js             → filtro por categoria + grade de produtos + destaques
│   ├── whatsapp.js         → formulário de checkout + geração da mensagem
│   └── app.js              → só inicializa os módulos acima
├── assets/
│   ├── logo/logo.jpg       → logo enviada
│   ├── produtos/           → (vazio) fotos oficiais dos doces entram aqui
│   └── banners/            → (vazio) banners/imagens de destaque, se precisar
└── README.md
```

## Antes de publicar (Fase 3 e 4 do plano)

1. **Número do WhatsApp**: em `js/whatsapp.js`, troque a constante `NUMBER`
   pelo número real da loja (formato `55DDDNNNNNNNNN`, só dígitos).
2. **Fotos**: coloque as fotos oficiais em `assets/produtos/` e troque o
   placeholder de ícone pela tag `<img>` dentro da função `photoHTML` em
   `js/menu.js` (tem um comentário indicando exatamente onde).
3. **Preços e descrições**: revise o array `PM.PRODUCTS` em `js/products.js`
   com a proprietária.
4. **Endereço, horário, Instagram**: hoje estão como texto de espera na
   seção "Contato" do `index.html` — troque pelos dados reais.
5. **Testar**: abrir no iPhone e no Android antes de publicar, e simular um
   pedido completo até o WhatsApp abrir com a mensagem certa.
6. **Publicar**: como é só HTML/CSS/JS estático, dá pra subir direto na
   Netlify (arrastar a pasta no painel, ou conectar um repositório Git).

## Fase 5 (evolução futura)

Quando quiser sair do array fixo em `products.js` e permitir que a
proprietária edite produtos sem mexer no código, a migração natural é para
o Supabase (tabelas `products`, `categories`, `orders`, `order_items`, como
já discutido) + um painel administrativo simples.
