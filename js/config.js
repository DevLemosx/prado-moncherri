/**
 * config.js
 * Dados de conexão do projeto Supabase (prado-moncherri).
 *
 * A "chave publicável" abaixo é segura pra ficar visível no código do site —
 * é assim que o Supabase funciona. Quem protege os dados são as políticas de
 * Row Level Security criadas no banco (produtos/categorias só leitura
 * pública; pedidos só criação pública; qualquer escrita de verdade exige
 * login, que é do painel administrativo, ainda não construído).
 */
window.PM = window.PM || {};

PM.CONFIG = {
  SUPABASE_URL: "https://pyjckjeixbqrdhoemwlx.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_059vFC8Reh7zuvkpKvb8_A_UFMtdwPc"
};
