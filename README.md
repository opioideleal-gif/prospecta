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
├── shared/          normalize.ts (telefone/e-mail/URL) e research.ts (parser anti-invenção)
├── server/store.ts  leitura de site + persistência em .data/prospecta.json
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
| **Leads** | 157 empresas, busca, filtros de segmento/prioridade/estágio/follow-up, ordenação, faixa de funil clicável, mudança de status em 13 estágios, CSV import com dedupe, cadastro manual |
| **Ficha da empresa** | Contato (telefone/WhatsApp/site/Instagram/e-mail/localização) com links reais, **DADOS ENCONTRADOS** nos 5 grupos da pesquisa, **INTERPRETAÇÃO COMERCIAL** separada dos fatos, score com motivos e delta de evidência, estágio com stepper, follow-up com data, observações, histórico completo e barra de ações fixa |
| **Oportunidades** | Agrupamento por serviço ofertado com score médio e "caçar mais deste perfil" |
| **Playbook** | 4 scripts por estágio (primeiro contato, follow-up, qualificação, agendamento) + as 3 abordagens Direta/Consultiva/Natural aplicadas a um lead qualquer, com o objetivo comercial selecionável |
| **Caçar Leads** | Busca em DuckDuckGo/Bing via `server/hunt.ts`, extrai telefone/site, calcula score, exibe a confiança por resultado (alta/média/baixa). Cada resultado tem **Pesquisar / Adicionar aos Leads / Abrir WhatsApp** e nada é selecionado nem importado automaticamente |
| **Resultados** | Funil por canal (telefone/WhatsApp/site/Instagram/e-mail), taxas por segmento, tudo calculado sobre eventos reais |
| **Exportar** | CSV da seleção filtrada atual, com `;` e BOM — os cabeçalhos batem com os que o importador reconhece, então dá para exportar, editar e reimportar |

## Fluxo central

A tela segue a ordem real de trabalho de quem prospecta:

```
encontrar  →  analisar  →  identificar oportunidade  →  abordar
   ↑                                                        ↓
  fechar  ←  acompanhar follow-up  ←  registrar contato  ←─┘
```

Cada passo tem um atalho dentro da ficha do lead (`.detail-actions`): **Abrir WhatsApp**,
**Gerar abordagem**, **Contato realizado**, **Copiar mensagem**, **Marcar enviada** — mais o
stepper de estágio, a agenda de follow-up e o campo de observação no corpo da ficha.

O trecho **pesquisar → analisar → script** é um pipeline de dados, não três telas soltas:

```
/api/research → shared/research.ts (parsePageFacts)   → fatos + presença (found/absent/unknown)
              → client/src/researchApply.ts          → preenche os campos vazios do lead
              → intelligence.ts interpretLead         → hipótese comercial (sempre marcada como tal)
              → intelligence.ts evidenceScore          → score + os deltas que o produziram
              → approach.ts buildApproaches            → 3 estilos, 1 objetivo, texto editável
```

- `parsePageFacts` é a **única** coisa que lê HTML, e é pura: sem rede, testável, usada igual pelo
  servidor e pelos testes. Ela nunca escreve `absent` para uma página que não respondeu —
  nesses casos tudo fica `unknown`, então "o site não existe" é estruturalmente impossível.
- **`Listagem no Google` é o único item que nenhuma leitura de página pode responder**, e por isso
  nasce como `unknown`. Ele só vira `encontrado` pela caça (`withSearchListing`): se a empresa
  apareceu no resultado de busca, isso é fato, com `provider` + `query` + `sourceUrl` como evidência,
  e vale `+2` no score. A leitura pelo botão da ficha continua marcando o item como não verificado —
  ninguém finge que procurou no buscador.
- Quem vem da caça carrega também a **fonte da busca** como linha de evidência no lead
  (`A empresa aparece no resultado de busca pública para “refrigeração Belém”` + `sourceUrl` +
  confiança do resultado) — a ficha mostra isso em `FATO PESQUISADO`, então dá para auditar de onde
  saiu cada dado antes de abordar.
- Ao corrigir maiúscula de frase, o gerador **não toca em texto citado** do site do lead
  (descrição, nota, heading): ele sai da string, é capitalizado em volta e volta byte por byte.
- O parser é calibrado para as formas de site que existem aqui, com **guardas contra falso
  positivo** (cada uma tem fixture próprio em `pipeline.test.ts`): a palavra `Menu` da navegação
  **não** conta como catálogo — senão quase todo site ganharia o `+9` e perderia o gancho de
  "mostrar o que vende"; `api.whatsapp.com/send?phone=`, `wa.link/` e `whatsapp://send` contam como
  canal (só `wa.me` deixaria de fora a maioria das PMEs); preço (`R$ 89,90`) e `add-to-cart` em
  classe de botão identificam catálogo/venda online de Nuvemshop/Shopify/WooCommerce; telefone
  embutido em payload de SPA (`__NEXT_DATA__`) só é lido quando está atribuído a uma chave de
  contato — o que mantém CNPJ e CEP fora de `phones`.
- `buildApproaches` só monta frase a partir de campo que existe. O que falta não aparece na
  mensagem e vai para a lista `de fora:` do painel, para você auditar o que foi deixado de lado.
- A linha `usa:` é **por estilo**: ela lista só o que aquele texto realmente diz (a Nota do vendedor
  aparece no `usa:` do Natural, não no da Direta), e em lead encerrado ela fica vazia de propósito.
- Vocabulário de comida (`cardápio` × `catálogo`) é decidido pelo que o lead escreve — título,
  descrição, headings, produtos — e **nunca** pela string que prova a ausência de catálogo
  (`nenhum catálogo/cardápio na página lida`). Sem essa regra, clínica odontológica pedia cardápio.
- Quem já tem contato registrado (`status` do funil **ou** um evento como `Contato realizado`,
  `Mensagem enviada`, `Follow-up`) recebe os 3 estilos em modo retomada — "Te mandei uma mensagem
  há Ndias" em vez de "Oi!" de primeiro contato; `lead.events` conta tanto quanto `lead.status`.
- A **análise alimenta o script**: `contextFromLead` dá precedência ao que a leitura produziu
  (`interpretation.opportunity` e `interpretation.detectedProblems`) sobre a heurística de cadastro.
  Um ganho vindo da página é dito como *"Pelo que vi no site de vocês, catálogo online não aparece —
  se já rola por outro canal, me diz"*: fala da página lida, nunca da empresa inteira, e sai da lista
  quando a leitura falhou (`detectedProblems` vazio por construção).
- Lead sem site cadastrado **não** é tratado como erro: não há o que ler, o painel fica no estado
  neutro "nada foi pesquisado" e a análise segue só com o cadastro.
- O objetivo comercial (`Site`, `Landing page`, `Catálogo digital`, `E-commerce`, `Automação`,
  `WhatsApp`, `Presença digital`, `Serviço recorrente`, `Outro`) muda **a oferta**, nunca a
  afirmação sobre a empresa. Detectado da oportunidade, pode ser trocado na ficha e no Playbook.
- O estágio do funil + o histórico escolhem o enquadramento: quem já respondeu recebe
  "pegando o gancho do que vocês me responderam", quem está encerrado recebe um texto sem oferta.
- **Hidratação em um ponto só:** `withStoredEvidence` reconstrói campos vazios, interpretação,
  `scoreBase` e deltas a partir dos fatos guardados no lead (ou no registro de pesquisa), então
  lista, ficha, score e mensagem nunca discordam depois de um reload — e abrir a ficha não dispara
  leitura nenhuma. No card, o score ganha o rótulo de procedência (`com evidência (70→88)`,
  `lido, sem mudança no score`, `fonte não respondeu`, `só o cadastro`) com os deltas no `title`.
- **Cache com saída:** o lead guarda `facts` + `researchedAt`, então a ficha não relê o site a cada
  abertura; o botão vira **Reler o site** e a releitura substitui análise e score **sem tocar** no que você
  cadastrou nem no rascunho editado.
- **Releitura é idempotente e não destrói:** o `scoreBase` congelado na primeira leitura é a base do
  `evidenceScore`, então clicar em "Reler" recomputa os mesmos deltas em vez de somá-los de novo; e se a
  releitura encontrar o site fora do ar, os fatos já verificados (e o score) são **mantidos**, com a
  falha registrada no painel — um erro de rede não apaga trabalho nem vira penalidade.
- O texto gerado é **editável**; ao copiar ou abrir o WhatsApp sai o seu texto, não o original
  (que volta com "restaurar texto gerado").

Detalhes de implementação:

- **Persistência:** `localStorage` no browser (`prospecta-leads-v2`, `prospecta-statuses-v2`)
  e `.data/prospecta.json` no servidor (cache de pesquisa). Nada de Postgres ainda — o
  `server/schema.sql` tem 13 tabelas `companies/contacts/leads/...` prontas, mas **nenhum código as usa**.
- **Score:** heurístico e determinístico (`client/src/intelligence.ts` casa-chave →
  dor/oportunidade/serviço recomendado), entre 35 e 98. **Não é IA chamada em runtime.**
  `evidenceScore` aplica os achados da pesquisa por cima da heurística (+6 WhatsApp confirmado
  no site, +5 Instagram linkado, +9 mostra o produto mas não vende online, +7 telefone que o
  cadastro não tinha, +2 listagem em buscador — essa só a caça pode dar, −6 site que não
  respondeu, −3 dor ainda não documentada) com **teto de ±18 pontos** — e os deltas exibidos são
  exatamente os aplicados, com a evidência que os gerou. Sem pesquisa, o score é o da base e o
  painel diz "ainda sem evidência externa".
- **Contato no card:** site, Instagram e e-mail do lead são links reais (`toUrl`, `profileUrl`,
  `mailto:`), calculados por `contactLinksOf` — a mesma função da ficha, para os dois lugares
  nunca discordarem sobre para onde um dado aponta. Instagram salvo como URL vira link de
  **perfil**, não de busca. Sem o dado, não existe link quebrado: some a âncora, o texto fica.
- **CSV:** as 16 colunas de cadastro continuam nas mesmas posições (a importação é por nome de
  cabeçalho e continua redonda); depois delas o arquivo leva o que a pesquisa produziu —
  `site_url`, `whatsapp_url`, `instagram_url`, `pesquisa_de_site` (`lido em 12/09` ·
  `não lido` · `não respondeu (HTTP 500)`), `score_base`, `motivos_do_score`, `ganhos_possiveis`,
  `sem_prova`, `objetivo_comercial` e `abordagem gerada`. A mensagem exportada é **a mesma que o
  app enviaria** (rascunho editado vence o gerado), e interpretação nunca se mistura com fato:
  os campos têm nome que diz de onde vieram.
- **Entrega:** o bundle é dividido em `react` / `vendor` / `icons` / app (o chunk da aplicação
  caiu de 581 kB para ~270 kB), e o Express serve asset com hash no nome como
  `immutable, max-age=31536000` com **gzip em streaming feito com `node:zlib`** — sem adicionar
  dependência. O teste descompacta e compara byte a byte com o arquivo do disco.
- **CSS:** três camadas em ordem de importação — `index.css` (design system) →
  `feature.css` (funcionalidades) → `operations.css` (ficha, funil, follow-ups).
  A última só acrescenta seletores; não sobrescreve regra existente por remoção.
- **Testes:** `pnpm test` roda 105 casos em `client/src/__tests__/` e **nenhum deles toca a
  rede**: `pipeline.test.ts` faz o parser ler HTML de fixture e cobre pesquisa, normalização de
  telefone, aproveitamento dos dados, ausência que não vira afirmação, score com motivos, 3
  estilos, objetivo, histórico, mensagem editada, persistência, idempotência do score na releitura, e leitura de formatos reais de site (WordPress/Elementor, Nuvemshop, landing de Instagram, SPA Next.js); `flows.test.tsx` (happy-dom) cobre
  as 6 abas, filtros, ficha, ações rápidas, caça com ações por empresa, CSV, follow-up e reload;
  `api.test.ts` valida o contrato das rotas Express.
- **Follow-up:** "Concluir" limpa a data, registra o evento e **não** move o estágio — avançar
  no funil continua decisão explícita do vendedor (stepper ou select).
- **Contato:** botão de WhatsApp gerado na hora como `https://wa.me/55+DDD+número` (telefone normalizado).
  `shared/normalize.ts` guarda as duas formas do número — `(91) 99999-9999` para ler e
  `5591999999999` para enviar — sem reescrever o que está no cadastro. O corpo da mensagem vai para o
  histórico junto do evento "WhatsApp aberto". E-mail e site aparecem no card do lead, mas **não** são
  clicáveis — não há `mailto:` nem link de site (só na ficha).
- **Type-check:** `pnpm check` passa limpo (TypeScript `strict: true`, 0 erros).

## Limitações conhecidas

1. **Caçar Leads depende de scraping de página de resultado** do DuckDuckGo/Bing — quebra sem
   rede, com bloqueio de bot ou quando o buscador muda o HTML. Trate como melhor esforço.
2. **Sem autenticação e sem multiusuário.** Um operador, uma máquina.
3. **Nenhum envio é confirmado de verdade** — o histórico guarda o texto que foi aberto no
   WhatsApp e a marcação de "enviada" continua manual.
4. `template.json` é resíduo do gerador (template original do Manus) e pode ser ignorado.
5. `attached_assets/` não existe no repo, mas o alias `@assets` do `vite.config.ts` aponta para ele.
   O `package.json` também lista um pacote `add@^2.0.6` em devDependencies (resíduo de um
   `pnpm add` digitado errado) — inofensivo, removível.
6. `client/src/components/Map.tsx` é só a documentação de exemplo do Google Maps, não está em uso
   (e exigiria API key). Dos 53 componentes shadcn em `client/src/components/ui/`, só 5 são
   importados — o app é estilizado em CSS próprio.
7. Bundle único de ~540 kB JS — sem code-splitting; o `index.html` não define
   `VITE_ANALYTICS_*`, daí os dois avisos no build.
8. `pnpm format` (prettier) nunca foi rodado no repo e **não** deve ser: formataria o
   `Home.tsx` de ~140 para ~2400 linhas e apagaria o histórico de revisão do diff.
9. O `schema.sql` de 13 tabelas continua sem uso — decisão explícita de adiar o banco.
