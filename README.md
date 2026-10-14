# Arcane Chess

Xadrez 3D com poderes mágicos, sistema de energia, IA com quatro níveis e progressão — roda inteiramente no navegador (celular e computador), sem servidor.

> Estado: **primeira versão jogável**. Veja "Limitações conhecidas" no fim deste arquivo para o que ainda não existe.

## Como executar

```bash
npm install
npm run dev        # servidor de desenvolvimento (http://localhost:5173)
npm run build      # checagem de tipos + build de produção em dist/
npm run preview    # serve o build de produção
npm test           # testes automatizados (Vitest)
npm run simulate   # partidas IA x IA para balanceamento (gera scripts/sim-report.json)
```

Requer Node 20+ e um navegador com WebGL.

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
  core/       Regras puras, sem DOM nem 3D (testáveis em Node)
    types.ts      Tipos do estado, ações, eventos
    balance.ts    TODOS os números de balanceamento (custos, alcances, durações, energia)
    game.ts       Motor transacional: createGame / applyAction / poderes / energia / fim de jogo
    squares.ts    Utilidades de casas
  ai/
    search.ts     Negamax alfa-beta + quiescência + aprofundamento iterativo; avalia poderes e energia
    eval.ts       Avaliação material/posicional e valor da energia
    worker.ts     Execução em Web Worker; client.ts faz a ponte (com fallback)
  meta/
    profile.ts    XP, níveis, moedas, desafios, conquistas, loja (idempotente por partida)
    catalog.ts    Itens cosméticos, temas, peles de peças, rastros, efeitos de captura
    session.ts    Partida salva (validação), histórico, resumo da partida
    settings.ts   Configurações com saneamento
    storage.ts    Persistência local
  render/
    scene.ts      BoardView: cena, câmera, seleção por toque/clique, destaques, zonas, animações
    pieces.ts     Modelos 3D procedurais das peças (torno + extrusão)
    fx.ts         Partículas, ondas de choque, feixes, runas, rastros
    tween.ts      Animações por tempo (com "pular")
  ui/
    app.ts        Menu e telas (jogar, dificuldade, personalização, temas, conquistas, histórico, tutorial, configurações, créditos)
    match.ts      Controlador da partida + HUD
    audio.ts      Efeitos sonoros sintetizados (WebAudio)
  i18n/           pt-BR e inglês
```

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

Conquistas (19): primeira partida, primeira vitória, primeiro xeque-mate, vitórias contra Médio/Difícil/Mestre, primeiro poder, usar os seis poderes, vencer sem poderes, vencer de pretas, **xeque-mate arcano** (mate dado por um poder), **grão-arcanista** (seis poderes numa só vitória), primeira promoção, 3 vitórias seguidas, 10 vitórias, 25 partidas, níveis 5 e 10, colecionador.

Temas: Clássico Real, Arcano Azul, Reino Dourado, Obsidiana, Gelo Místico, Chamas Arcanas, Cosmos, Mármore Antigo.

## Instalar no celular (modo app / offline)

O build de produção inclui manifesto e *service worker*: no Chrome do celular, abra o jogo e use **⋮ → Instalar app / Adicionar à tela inicial**. Depois do primeiro acesso, o jogo funciona sem internet (a IA e o salvamento já são locais).

## Controles

- **Selecionar/mover**: toque ou clique na peça e depois no destino.
- **Câmera**: arrastar (1 dedo / botão esquerdo) gira; pinça / roda faz zoom; 2 dedos / botão direito desloca. Limites de zoom, ângulo e deslocamento impedem perder o tabuleiro. Botão "Restaurar câmera".
- **Esc**: pula a animação ou cancela a seleção.

## Testes

`npm test` cobre: regras tradicionais (roque, en passant, promoção, mate, afogamento, repetição), energia (turno, teto, bônus de captura único), cada poder (alcance, ocupação, segurança do rei, zonas, limites por turno, ausência de en passant), IA (somente ações legais em todos os níveis, mate em 1, captura, partidas IA×IA), progressão (recompensa única, desistência, desfazer), loja (saldo, duplicatas, requisitos) e persistência (configurações e saves corrompidos).

## Limitações conhecidas

- Sem multijogador (local ou online) e sem contas: só jogador × IA.
- Sem música; os efeitos sonoros são sintetizados e simples.
- A IA considera os poderes do adversário apenas como ameaça de um lance (não dentro de toda a árvore de busca).
- Peças são modelos procedurais estilizados (sem modelos esculpidos externos).
- Balanceamento ainda baseado em poucas simulações (`npm run simulate`).
