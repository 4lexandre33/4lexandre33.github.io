# Matriz de comandos — tudo que é visual tem texto e ferramenta de IA

Cada recurso visual do GeoMannequin pode ser feito por três caminhos: no **texto** (editor Texto do site, a mesma linguagem que a IA escreve), num **botão** do site e por uma **ferramenta MCP** (Claude, ChatGPT e Gemini usam as mesmas ferramentas). Capítulos = manual (site → Texto → Manual; MCP `manual_name`, `manual_filme`, `manual_avancado`).

| Recurso | Texto (DSL) | Site | MCP | Cap. |
|---|---|---|---|---|
| Elenco por cor, figurantes | `elenco` · `Kai relevante` | Texto | `gerar_name`, `validar_name` | 2 |
| Local geométrico, objetos | `local "X" unidade m` · `mesa "m" em (x,z)` | Texto, aba Local/Locais | `previa_local`, `salvar_local`, `abrir_local` | 3, 10 |
| Objeto inclinado/tombado/deitado | `caixa em (x,z) inclina 30` · `tomba 90` · `deitado` · `de-pe` | Texto | `gerar_name`, `filme_texto` | 23 |
| Quadro, plano, ângulo, lente | `quadro 1 plano close alvo Kai lado 3/4 angulo plongee lente 85` | Texto, aba Ficha | `ficha_quadro`, `gerar_name` | 4 |
| Poses, gestos, expressões | `Kai pose X` · `gesto` · `expressao` · bloco `pose` | Texto, Biblioteca, painéis | `pose_texto`, `codigo_de_pose`, `catalogo_dsl` | 11, 14 |
| Animações | `0s Kai anima X` · bloco `animacao`/`ciclo` | Texto, painel Animação | `animacao_texto`, `codigo_de_animacao`, `lote` | 12, 14 |
| Escala do corpo (gigante, anão, fada) | `Golias gigante 4` · `anao` · `fada` · `escala 0.5` | Texto, painel Corpo (Escala) | `gerar_name`, `filme_texto`, `editar_manequim` | 23 |
| Voo e apoio em outro corpo | `paira 1.5m` · `voa-ate X altura 6m` · `pousa` · `sobre-mao Golias` | Texto | `filme_texto` | 23 |
| Orientação do corpo | `inclina-corpo 30` · `tomba-corpo 45` · `de-lado` · `de-cabeca-para-baixo` | Texto, painel Corpo | `filme_texto`, `editar_manequim` | 23 |
| Animais quadrúpedes | `Trovão animal cavalo sela` · `pose empinado` · `galopa 15m` | Texto | `animais`, `filme_texto` | 22 |
| Montaria, carga, seguir | `Kai monta Trovão` · `desmonta` · `carrega "mala"` · `Rex segue Kai` | Texto | `filme_texto`, `exportar_filme` | 22 |
| Página de HQ | `pagina formato manga leitura japonesa sangria dupla splash` | HQ e mais… → Páginas PNG/PDF/CBZ | `paginas_hq` | 24 |
| Painel diagonal/sem borda | `quadro 2 borda diagonal 12` · `sem-borda` · `tamanho splash` | Texto | `paginas_hq` | 24 |
| Balões por tipo | `fala` · `pensa` · `grita` · `sussurra` · `radio` · `narra` | automático nas páginas | `paginas_hq`, `webtoon` | 24 |
| Webtoon (espaço = tempo) | `ritmo momento|acao|sujeito|lugar|cena` · `respiro 1.5` | HQ e mais… → Webtoon | `webtoon` | 24 |
| Diretor automático | `diretor auto` · `cobertura auto` · `camera auto` | Texto | todas que compilam | 25 |
| Alternativas de quadro | `alternativas 6` | HQ e mais… → Alternativas | `quadro_alternativas` | 25 |
| Avisos de composição | (automático) | lista de erros/avisos | `validar_name` | 25 |
| Filme → cena → plano | `filme` · `cena` · `plano 1 duracao 6s` | aba Filme | `filme_texto`, `plano_previa` | 15 |
| Câmera de cinema | `camera segue|fixa|pov|sobre-o-ombro|presa-em` · `orbita 90 em 2s` | aba Filme | `camera_plano`, `plano_previa` | 16 |
| Percurso de câmera | `camera caminho (x,y,z) (x,y,z)… em 5s olha Kai` | aba Filme | `camera_plano`, `exportar_filme` | 26 |
| Dolly zoom (vertigo) | `0s camera vertigo aproxima 50 em 3s` | aba Filme | `exportar_filme` | 26 |
| Curvas dos movimentos | `… em 2s linear|entra|sai|suave` | aba Filme | `exportar_filme` | 26 |
| Câmera lenta, acelerar, congelar | `plano 2 duracao 3s lento 50% congela 1.5s por 1s` | aba Filme | `exportar_filme` | 26 |
| Andar por um percurso | `0s Kai anda por (0,0) (3,1) (3,4)` | aba Filme | `filme_texto`, `andar_ate` | 26 |
| Linha do tempo | (gerada) | aba Filme: clicar vai à linha, arrastar muda o segundo | `filme_texto` (roteiro) | 26 |
| MP4 e pacote para IA de vídeo | — | Filme → MP4, MP4 do plano, Pacote | `exportar_filme` | 20 |
| Passes em vídeo | — | — (só MCP) | `exportar_filme passes [...]` | 26 |
| Passes de quadro (ControlNet) | — | Baixar .zip | `gerar_name passes`, `referencias_controlnet` | 7 |
| Auditor de pés e chão | — | HQ e mais… → Auditar animações | `auditar_animacoes` | 26 |
| Catálogo em código | — | aba Biblioteca → Catálogo .md | `catalogo_dsl` | 20 |

Lacunas conhecidas (honesto): profundidade de campo (foco) só existe como passe de profundidade para pós-produção; som não é gerado (falas viram legenda e .srt); passes em vídeo não têm botão no site (só MCP, que usa o ffmpeg do computador).
