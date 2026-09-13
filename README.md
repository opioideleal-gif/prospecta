# Prospecta

Painel local de prospecção comercial em **Belém/PA** — geração de leads, priorização por score,
scripts de WhatsApp e um motor de "caça" a empresas via busca pública.
O pitch de produto é vender **sites, catálogos B2B, visualização 3D e operação comercial recorrente**
para imobiliárias, distribuidoras e empresas de serviços.

O projeto veio de uma exportação do Manus (templates `vite-plugin-manus-runtime`, collector de debug
em `.manus-logs/`) e hoje roda 100% local, **sem banco de dados e sem nenhuma chave de API obrigatória**.

```
prospecao-whatsapp-belem-refinado-mvp/prospecao-whatsapp-belem/
├── client/          React 19 + Vite 7 + Tailwind 4 + shadcn/ui
│   └── src/pages/Home.tsx      ← todo o app vive aqui (1 SPA, ~100 linhas de JSX denso)
├── server/          Express: /api/hunt-leads, /api/research, /api/health
├── shared/const.ts  cookie/const
└── client/src/*.ts  base de leads congelada (157 empresas) + motor de inferência
```

## Rodando

Requisitos: Node 20+ e pnpm (`corepack enable`).

```bash
cd prospecao-whatsapp-belem-refinado-mvp/prospecao-whatsapp-belem
pnpm install
pnpm rebuild esbuild @tailwindcss/oxide   # se os binaries nativos forem ignorados
```

**Modo dev** (HMR + API separada — são dois terminais):

```bash
pnpm dev:api   # Express em :8787
pnpm dev       # Vite em :3000, com proxy /api → :8787
```

No Windows (cmd/PowerShell) o `PORT=8787` do `dev:api` não funciona; rode
`$env:PORT=8787; pnpm tsx watch server/index.ts` ou use `pnpm start` (modo build).

**Modo produção** (um único processo servindo UI + API em `:3000`):

```bash
pnpm build
NODE_ENV=production node dist/index.js
```

Abra <http://localhost:3000>.

## O que existe hoje

| Área | Estado |
| --- | --- |
| **Hoje** | Fila do dia com follow-ups vencidos, melhor lead, top 8 ordenados por score |
| **Leads** | 157 empresas, filtro por segmento/prioridade/busca, mudança de status em 12 estágios, CSV import, cadastro manual |
| **Oportunidades** | Agrupamento por serviço ofertado com score médio e "caçar mais deste perfil" |
| **Playbook** | Scripts prontos por estágio (primeiro contato, follow-up, qualificação) + variantes Direta/Consultiva/Natural |
| **Caçar Leads** | Busca em DuckDuckGo/Bing via `server/hunt.ts`, extrai telefone/site, calcula score e confiança, importa os marcados |
| **Resultados** | Funil por canal (telefone/WhatsApp/site/Instagram/e-mail), taxas por segmento, tudo calculado sobre eventos reais |

Detalhes de implementação:

- **Persistência:** `localStorage` no browser (`prospecta-leads-v2`, `prospecta-statuses-v2`)
  e `.data/prospecta.json` no servidor (cache de pesquisa). Nada de Postgres ainda — o
  `server/schema.sql` tem 13 tabelas `companies/contacts/leads/...` prontas, mas **nenhum código as usa**.
- **Score:** heurístico e determinístico (`client/src/intelligence.ts` casa-chave →
  dor/oportunidade/serviço recomendado), entre 35 e 98. Não é IA chamada em runtime.
- **Contato:** botão de WhatsApp gerado na hora como `https://wa.me/55+DDD+número` (telefone normalizado).
  E-mail e site aparecem no card do lead, mas **não** são clicáveis — não há `mailto:` nem link de site.
- **Type-check:** `pnpm check` passa limpo (TypeScript `strict: true`, 0 erros).

## Limitações conhecidas

1. **Caçar Leads depende de scraping de página de resultado** do DuckDuckGo/Bing — quebra sem
   rede, com bloqueio de bot ou quando o buscador muda o HTML. Trate como melhor esforço.
2. **Sem autenticação e sem multiusuário.** Um operador, uma máquina.
3. **Sem histórico de mensagens enviadas de verdade** — o status é marcado à mão.
4. `template.json` é resíduo do gerador (template original do Manus) e pode ser ignorado.
5. `attached_assets/` não existe no repo, mas o alias `@assets` do `vite.config.ts` aponta para ele.
6. `client/src/components/Map.tsx` é só a documentação de exemplo do Google Maps, não está em uso
   (e exigiria API key).
7. Bundle único de ~512 kB JS — sem code-splitting; o `index.html` do dev não define
   `VITE_ANALYTICS_*`, daí os dois avisos no build.
