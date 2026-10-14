# Arcane Chess

Xadrez 3D com poderes mágicos, sistema de energia, IA com quatro níveis e progressão — roda inteiramente no navegador (celular e computador), sem servidor.

> Estado: **primeira versão jogável**. Veja "Limitações conhecidas" no fim deste arquivo para o que ainda não existe.

## Como executar

```bash
npm install
npm run dev        # servidor de desenvolvimento (http://localhost:5173)
npm run build      # checagem de tipos + build de produção em dist/
npm run preview    # serve o build de produção
npm test           # testes automatizados de lógica (Vitest)
npm run test:e2e   # testes de interface no Chromium (Playwright; compila e sobe o preview sozinho)
npm run simulate   # partidas IA x IA para balanceamento (gera scripts/sim-report.json)
```

Requer Node 20+ e um navegador com WebGL 2. Para os testes de interface, o Chromium do Playwright precisa estar instalado (`npx playwright install chromium`) ou indicado em `PW_CHROMIUM_PATH`.

## Tecnologias

| Camada | Escolha |
| --- | --- |
| Linguagem | TypeScript (strict) |
| 3D | Three.js (modelos procedurais, OrbitControls, iluminação PBR) |
| Regras tradicionais | chess.js 1.4.0 (versão fixada) |
| Build | Vite |
| Testes | Vitest |
| Salvamento | `localStorage` (dados pequenos e lidos de forma síncrona; histórico limitado a 50 partidas) |
| IA | Web Worker (não bloqueia a interface) |

## Arquitetura

```
src/
  core/         Regras puras, sem DOM nem Three.js (testáveis em Node)
    types.ts      Tipos explícitos: estado, ações, eventos, efeitos, resultados
    balance.ts    Todos os números de balanceamento (custos, alcances, durações, energia)
    game.ts       Motor transacional: createGame / applyAction / validação / fim de jogo
    energy.ts     Sistema de energia (turno, captura, gasto único)
    zones.ts      Zonas antimagia (Escudo Real e Muralha)
    board.ts      Utilidades sobre o chess.js (FEN de poderes, segurança do rei)
    powers/       Um módulo por habilidade: custo, pré-condição, destinos, efeito
  ai/           Busca negamax + quiescência em Web Worker; usa a mesma applyAction do jogador
  tutorial/     Lições e exercícios (dados + objetivos verificáveis)
  meta/         Progressão (XP, moedas, conquistas, loja), catálogo, sessão/histórico, configurações, persistência
  render/       Three.js: cena, peças procedurais, efeitos, animações (nunca decide legalidade)
  ui/           Menu, HUD da partida, tutorial, áudio; screens/ (histórico, configurações)
  i18n/         Dicionários pt-BR e inglês (todos os textos)
tests/          Vitest: regras, energia, poderes, IA, progressão, persistência, tutorial
e2e/            Playwright: toque, mouse, idioma, redimensionamento, menus, câmera, persistência, tutorial
public/         Manifesto, ícones e service worker (instalação e modo offline)
```

A estrutura sugerida no documento (engine/rules/powers/energy/…) foi adaptada: as pastas acima mantêm a mesma separação de responsabilidades com menos arquivos.

### Fluxo transacional das jogadas

1. O jogador seleciona uma peça → a interface mostra lances legais e o poder da peça (custo, alcance, tipo, motivo de indisponibilidade).
2. Ao ativar um poder de movimento, os destinos válidos são destacados; o jogador escolhe o destino.
3. `applyAction(state, action)` valida tudo (vez, peça, energia, limites por turno, zonas, segurança do rei) e calcula o **novo estado sem alterar o anterior**.
4. Só se a ação for válida o novo estado é confirmado: energia descontada uma vez, turno encerrado, efeitos expirados, energia do próximo turno concedida, fim de jogo verificado.
5. Os **eventos** retornados alimentam animações e sons. Ao final, o tabuleiro 3D é sincronizado com o FEN oficial — a animação nunca decide o resultado; pular/interromper a animação não altera nada.

Qualquer falha retorna `{ ok: false, error }` sem consumir energia e sem alterações parciais.

## Regras

Todas as regras tradicionais (lances legais, xeque, xeque-mate, roque, en passant, promoção com escolha, afogamento, material insuficiente, 50 lances, repetição tripla) vêm do chess.js. A repetição é contada pelo próprio motor do jogo, porque lances mágicos recarregam a posição.

**Vitória e empate seguem as regras tradicionais**: se o jogador não tem lances tradicionais e está em xeque, é mate — mesmo que um poder pudesse “salvar” o rei. Isso impede que poderes anulem o xeque-mate.

### Energia

| Regra | Valor |
| --- | --- |
| Máximo | 200 |
| Inicial | 20 (configurável em `balance.ts`) |
| Início de cada turno próprio | +10 |
| Captura | +15, no máximo uma vez por turno |

A IA segue exatamente as mesmas regras. A energia é atualizada apenas por `applyAction` (determinística, independente de animações). Salvar/recarregar restaura o estado exato, então não há recuperação extra por reinício ou pausa.

### Poderes

Cada peça pode usar no máximo um poder por turno, e cada tipo de poder só pode ser usado uma vez por turno. Poderes de **movimento** encerram o turno (são o lance do turno). Poderes de **suporte** não movem peças e não encerram o turno — depois deles, o jogador ainda faz o seu lance. Nenhum poder captura, e nenhum pode deixar o próprio rei em xeque (em xeque, só valem ações que o resolvam).

| Peça | Poder | Custo | Tipo | Alcance / efeito | Duração |
| --- | --- | --- | --- | --- | --- |
| Rei | Escudo Real | 40 | Suporte | Zona antimagia de raio 2 ao redor do rei (acompanha o rei): poderes de movimento inimigos não podem terminar nela | Até o fim do próximo turno adversário |
| Rainha | Passo Arcano | 80 | Movimento | Teleporte para casa **vazia** a até 3 casas (Chebyshev) que a rainha **não** alcançaria com um lance normal | Instantâneo |
| Torre | Muralha | 60 | Suporte | Zona antimagia 3×3 fixa ao redor da torre (máx. 1 ativa por jogador) | 2 turnos adversários |
| Bispo | Visão Mística | 40 | Suporte | Revela peças aliadas atacadas e seus atacantes (tabuleiro todo) e casas perigosas/seguras a até 3 casas do bispo — tudo calculado pelo motor sobre a posição pública | Este turno e o próximo turno próprio |
| Cavalo | Salto Fantasma | 60 | Movimento | Salto para casa vazia a até 2 casas que **não** seja um salto normal de cavalo | Instantâneo |
| Peão | Impulso | 40 | Movimento | Avança 2 casas **fora** da fileira inicial; ambas as casas livres; não pode chegar à última fileira; não cria en passant | Instantâneo |

Decisões de projeto (seguindo as restrições do documento de requisitos):
- **Escudo Real** e **Muralha** foram implementados como bloqueio de um efeito mágico específico (destinos de poderes de movimento inimigos). Eles **não** bloqueiam lances tradicionais, não alteram o xeque e não tornam o rei invulnerável — assim o motor de xadrez permanece confiável.
- A Visão Mística não dá vantagem à IA (que já vê a posição pública); por isso a IA não a usa.
- Os custos são valores iniciais da tabela de referência; ajuste em `src/core/balance.ts`. O histórico de ativação (`powerLog`) fica registrado em cada partida.

## IA

| Nível | Comportamento |
| --- | --- |
| Fácil | Profundidade 1, ruído alto, 25% de lances aleatórios (sempre legais), usa poderes às vezes |
| Médio | Profundidade 2 + quiescência, considera poderes de movimento e Escudo/Muralha |
| Difícil | Profundidade 3 + quiescência; penaliza lances que deixam um poder inimigo forte; usa energia com reserva |
| Mestre | Aprofundamento iterativo até profundidade 5 com limite de 3,5 s; mesma análise de ameaças mágicas |

A dificuldade vem apenas da capacidade de análise — nunca de energia extra. A IA usa somente o estado público. Os poderes são avaliados na raiz da busca (o valor da energia entra com retornos decrescentes, e há penalidade por gastar tudo). Roda em Web Worker com indicador "pensando".

## Progressão e economia

- XP e moedas ao concluir partidas, conforme resultado e dificuldade; desafios por partida; conquistas; bônus de moedas por nível.
- Cada partida é recompensada **uma única vez** (por `gameId`). Desistências e partidas com menos de 10 meios-lances não rendem XP/moedas de partida. Usar "desfazer" reduz as recompensas pela metade.
- Loja apenas com **cosméticos** (temas, peças, rastros, efeitos de captura); valida saldo, nível, conquista e compra duplicada.
- Os dados são locais: podem ser perdidos ao limpar os dados do navegador e **não** são protegidos contra adulteração.

Conquistas (27), cada uma com nome, descrição, condição, barra de progresso, recompensa e indicador textual (✓ desbloqueada / ○ bloqueada): primeira partida, primeira vitória, primeiro xeque-mate, vitórias contra Médio/Difícil/Mestre, primeiro poder, **primeiro uso de cada um dos seis poderes**, usar os seis poderes, vencer sem poderes, vencer de pretas, xeque-mate arcano (mate dado por um poder), grão-arcanista (seis poderes numa só vitória), primeira promoção, 3 vitórias seguidas, **desafio estratégico** (qualquer desafio de partida) e mestre dos desafios (todos), 10 vitórias, 25 partidas, níveis 5 e 10, colecionador. Conclusão única por conquista; recompensas integradas a XP/moedas sem duplicação.

Temas: Clássico Real, Arcano Azul, Reino Dourado, Obsidiana, Gelo Místico, Chamas Arcanas, Cosmos, Mármore Antigo.

## Instalar no celular (modo app / offline)

O build de produção inclui manifesto e *service worker*: no Chrome do celular, abra o jogo e use **⋮ → Instalar app / Adicionar à tela inicial**. Depois do primeiro acesso, o jogo funciona sem internet (a IA e o salvamento já são locais).

## Controles

- **Selecionar/mover**: toque ou clique na peça e depois no destino.
- **Câmera**: arrastar (1 dedo / botão esquerdo) gira; pinça / roda faz zoom; 2 dedos / botão direito desloca. Limites de zoom, ângulo e deslocamento impedem perder o tabuleiro. Botão "Restaurar câmera".
- **Esc**: pula a animação ou cancela a seleção.

## Feitiços e cenários

Cada poder e cada captura tem uma pequena cena mágica (1 a 2 s), em `src/render/spells.ts`:

| Peça | Captura | Poder |
| --- | --- | --- |
| Peão | raízes prendem a vítima e uma árvore encantada brota e se desfaz em pétalas | Impulso: raízes empurram o peão e uma árvore brota onde ele estava |
| Cavalo | avança deixando cópias fantasmas | Salto Fantasma: rastro de cavalos espectrais |
| Bispo | o olho místico abre e fixa a vítima com um feixe | Visão Mística: o olho lança feixes sobre as peças inimigas da área |
| Torre | pilares de pedra rúnica irrompem ao redor | Muralha: pilares sobem em cada casa da zona |
| Rainha | vórtice de estrelas sob a vítima | Passo Arcano: portais de estrelas ligados por uma constelação |
| Rei | coroa de lâminas douradas desce sobre a vítima | Escudo Real: a coroa desce e explode em luz |

Depois do efeito, a peça capturada é arremessada e se estilhaça. Com "Reduzir movimento", os feitiços são desligados e a captura vira uma dissolução suave.

Cada tema da loja tem um cenário próprio: um panorama pintado por código (céu, sol/lua/eclipse/planetas, aurora, montanhas e castelo no estilo do tema — gótico, palácio, fortaleza, gelo, templo ou ilha flutuante) que acompanha a rotação da câmera, um pátio flutuante com braseiros e objetos temáticos (pinheiros, cristais, obeliscos, agulhas de obsidiana, gelo, rochas de lava, asteroides ou colunas) e clima (vaga-lumes, neve, brasas, partículas mágicas).

## Conjuntos de peças

Três formatos modelados por código (`src/render/pieces.ts`), cada parte com seu material (corpo, metal, gema ou cravejado):

- **Clássico (Staunton):** Marfim e Ébano (grátis), Madeira de Torneio, Mármore Clássico, Ouro e Prata, Jade e Obsidiana.
- **Luxo:** base larga de alabastro fosco com faixas de metal, haste metálica e topos cravejados (pavé): Alabastro Real (ouro × ônix e prata), Cristal, Diamante (inteiramente cravejado).
- **Régio:** alto e esguio, base e golas de ouro, corpo de pedra ou madeira e pedras preciosas: Âmbar e Ouro, Esmeralda Imperial (malaquita).

A loja mostra uma foto 3D real de cada conjunto (`src/render/thumbnail.ts`).

## Música

Trilha ambiente calma gerada pelo próprio jogo com WebAudio (`src/ui/music.ts`): acordes suaves em lá menor, baixo grave e notas esparsas com eco — sem arquivos de áudio externos. Começa após o primeiro toque/clique (exigência dos navegadores), pausa quando a aba fica em segundo plano e pode ser desligada pelo botão **♫ Música** no menu e na partida, ou ajustada em Configurações → Áudio (volume da música, multiplicado pelo volume geral).

## Configurações

Idioma, qualidade (automática/baixa/média/alta — a automática escolhe pelo aparelho e reduz a resolução se o FPS cair), sombras, partículas, coordenadas, animações (completas/pular), velocidade das animações, reduzir movimento, movimentos de câmera, sensibilidade da câmera, controle de toque (1 dedo gira ou 2 dedos giram), inverter perspectiva, permitir desfazer, som, volume geral, volume dos efeitos, música (liga/desliga) e volume da música, alto contraste, texto grande e **restaurar padrões**. Tudo é aplicado na hora, salvo automaticamente e pode ser alterado durante a partida (botão ⚙) sem reiniciá-la.

## Tutorial

12 lições cobrindo os 10 tópicos pedidos, com 10 exercícios práticos no tabuleiro 3D (mover, capturar, roque, mate, energia, ativar poder, custos, suporte + recuperação, animação de captura, vencer com um poder). Avançar, voltar, reiniciar e sair a qualquer momento. É oferecido no primeiro acesso e fica sempre no menu.

## Histórico

Cada partida concluída guarda: data/hora, resultado e motivo, cor, dificuldade, duração, lances, capturas (suas × IA), poderes usados (seus e da IA), recompensas, sequência de lances e posição final (mostrada num mini-tabuleiro). Filtros por resultado e dificuldade; apagar com confirmação. Nenhum dado pessoal é armazenado.

## Salvamento local

`localStorage`, com chaves versionadas (`arcane.*.v1`) e campo `version` em cada estrutura: configurações (v2, migradas da v1), perfil (XP, moedas, itens, conquistas, estatísticas — campos novos são completados), histórico (até 50 partidas) e a partida em andamento (FEN, energia, turno, zonas, visão, contagem de repetição, lances, uso de poderes do turno, pilha de desfazer). Dados inválidos ou corrompidos são descartados com aviso. A partida é salva após cada ação validada, antes da animação. **Não há sincronização entre aparelhos**, e os dados somem se o navegador apagar os dados do site.

## Testes

- `npm test` (Vitest, 61 testes): regras tradicionais (lances inválidos, xeque-mate, afogamento, repetição, roque, en passant, promoção, capturas, turnos), energia (+10, +15 uma vez por turno, teto 200, energia insuficiente, falhas não cobram, cobrança única), cada poder (custo, destinos válidos/inválidos, segurança do rei, limites por turno, duração dos efeitos, zonas, mate dado por poder), IA (só ações legais em todos os níveis, mate em 1, captura, zonas respeitadas, partidas IA×IA), progressão (recompensa única por partida, desistência, desfazer, progresso de conquistas), loja, persistência (salvar/carregar com efeitos ativos, dados corrompidos, migração de configurações e perfil), histórico e tutorial (cada exercício tem solução validada pelo motor).
- `npm run test:e2e` (Playwright, 8 testes no Chromium): navegação entre menus, seleção/movimento por mouse, seleção/movimento por toque, troca de idioma durante a partida, redimensionamento (desktop, celular em pé e deitado), controles de câmera, persistência de XP/conquistas/histórico após recarregar e tutorial.

## Limitações conhecidas

- Sem multijogador (local ou online) e sem contas: só jogador × IA.
- Música e efeitos são sintetizados em tempo real (sem gravações); a trilha é uma só, calma e contínua.
- A IA considera os poderes do adversário apenas como ameaça de um lance (não dentro de toda a árvore de busca).
- Peças são modelos procedurais estilizados (sem modelos esculpidos externos).
- Balanceamento ainda baseado em poucas simulações (`npm run simulate`).
