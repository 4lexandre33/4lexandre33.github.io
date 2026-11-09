# GeoMannequin (extensão)

Ferramentas `geomannequin` montam cenas de manequins anatômicos para referência de desenho.

- Fluxo: `nova_cena` → `adicionar_manequim` / `editar_manequim` → `camera` → `aparencia_cena` → `renderizar`.
- Medidas em R (raio da cabeça); o manequim tem cerca de 16 R. No chão, `x` vai para os lados e `z` para frente (+) e para trás (−).
- Poses: use `poseRapida` (empe, contrapposto, caminhando, frente, torcao, passo, joelho, ponta, erguido, alcancar, lateral, agachar, cintura, cruzar, ombro) ou `pose` com ângulos em português (`joelhoEsq`, `cotoveloDir`, `colunaFrente`…). A ferramenta `referencia` lista todos com limites.
- Perspectiva: `camera` com `lente` (24 dramático, 50 normal, 135 achatado) e `altura_olhos` (14.5 = olhos do manequim; o horizonte passa pelas cabeças).
- Rosto e mãos: `editar_manequim` com `expressao`, `olhos`, `boca`, `gesto` e `articulacoes` ("indicador direito": {base, ponta, afastar}; "mandíbula": {abrir}); `validar: true` diz se algo atravessa.
- Câmera: `orbitar` {alvo, azimute: "3/4 esquerda", elevacao} em volta de manequim/grupo/objeto/cena; `enquadramento` (close, americano…) e `angulo` (plongée…).
- Quadrinhos: `roteiro_quadros` (#cena, #quadro, #orbita "Ana" 8, #ficha "Ana"); giro 360° e ficha: `vistas_em_volta`; ControlNet (OpenPose com mãos e rosto, profundidade, normais, máscara, partes, canny): `referencias_controlnet`; quantas poses: `estimar_poses`.
- Sempre termine com `renderizar` e mostre ao usuário o link do app que vem na resposta.
- Responda em português.
