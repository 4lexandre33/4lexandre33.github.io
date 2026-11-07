/* GeoMannequin — exemplos de código e referência da API */
import { BODIES, BPOSES, todasPoses } from "./poses.js";
import { ALIAS } from "./parametros.js";

const EXAMPLES={
  "Três manequins em fila":`// cria três manequins lado a lado, cada um com sua cor
cena.limpar();
const a = cena.ativo;
a.posicao(-8, 0).poseRapida("contrapposto");
const b = cena.adicionar({ nome: "Atleta", x: 0, z: 0, corpo: "atletico" });
b.poseRapida("erguido");
const c = cena.adicionar({ nome: "Ana", x: 8, z: 0, corpo: { feminino: 0.95, seios: 0.55 } });
c.girar(-25).poseRapida("cintura");
camera.mirar(0, 6, 0).posicao(4, 9, 30);
cena.enquadrar();`,
  "Caminhada em grupo":`cena.limpar();
const lider = cena.ativo.renomear("Líder").poseRapida("caminhando");
for (let i = 1; i < 4; i++) {
  lider.copiar().posicao(i * 7.5, -i * 4).girar(0);
}
camera.posicao(14, 7, 18).mirar(4, 6, -4);
camera.perspectiva(true, 34);
cena.enquadrar();`,
  "Câmera de cima":`camera.mirar(0, 0, 0);
camera.posicao(0, 30, 12);
camera.perspectiva(false);
cena.enquadrar();`,
  "Pose por código":`const m = cena.ativo;
m.pose({ joelhoEsq: 70, coxaEsqFrente: 60, bracoDirAbrir: 120, cotoveloDir: 40, colunaLado: -8 });
m.cor("#d9ecf2", "#1f4f63");
log(m.info());`,
  "Profundidade: fila em perspectiva":`// manequins cada vez mais longe: ficam menores, sobem rumo ao horizonte e clareiam
cena.limpar();
cena.ativo.posicao(0, 0).poseRapida("contrapposto");
for (let i = 1; i <= 4; i++) {
  cena.adicionar({ nome: "Fundo " + i, x: (i % 2 ? 3 : -3), z: -7 * i, giro: 20 * i });
}
camera.perspectiva(true).lente(35).mirar(0, -7, -10).girar(28, 0);
camera.alturaOlhos(14.5);       // câmera na altura dos olhos (manequim ≈ 16 R): o horizonte passa pelas cabeças de todos
cena.horizonte(true);           // mostra horizonte e pontos de fuga
cena.sombras(true);
cena.atmosfera(0.6);
cena.enquadrar();`,
  "Lente: grande-angular × tele":`// mesma cena, troque a lente: 24 mm exagera a distância, 135 mm achata
camera.perspectiva(true).lente(24);   // experimente 50, 85, 135
cena.enquadrar();`,
  "Colisões: fila apertada":`// manequins caminhando perto demais: as mãos entram no vizinho
cena.limpar();
cena.ativo.poseRapida("caminhando");
for (let i = 1; i < 4; i++) cena.adicionar({ x: i * 2.3, z: -i * 1.9 }).poseRapida("caminhando");
camera.perspectiva(true).girar(-35, -10);
cena.enquadrar();
log(cena.colisoes().map(c => c.descricao));
// corrigir mudando o mínimo (troque por "distancia", "giro" ou "pose"):
// cena.resolverColisoes({ preferir: "auto" });`,
  "Cena descrita em português":`// uma frase só: poses, eixos, olhar e câmera
cena.limpar();
cena.descrever("manequim 1 sentado, manequim 2 deitado ao longo do eixo x, manequim 3 saltando olhando para baixo, câmera no eixo z, elevação alta");`,
  "Cena por código: eixos e apoios":`cena.limpar();
const cadeira = cena.objeto("cadeira", {x: -5, giro: 30});
const a = cena.ativo.renomear("Ana").sentar("cadeira");
const b = cena.adicionar({nome: "Beto", x: 3}).deitar("bruços", "-z");
a.olhar("Beto");
const c = cena.adicionar({nome: "Caio", x: 9}).saltar(4).orientar("câmera").olhar("baixo");
c.articulacao("ombro esquerdo", {abrir: 170}).gesto("direita", "joinha");
camera.eixo("z").elevacao("média");
cena.enquadrar();`,
  "Articulações uma a uma":`const m = cena.ativo;
m.poseRapida("empe");
m.articulacao("ombro direito", {frente: 90});
m.articulacao("cotovelo direito", {dobrar: 120});
m.articulacao("punho direito", {dobrar: -40});
m.articulacao("quadril esquerdo", {frente: 70});
m.articulacao("joelho esquerdo", {dobrar: 90});
m.articulacao("coluna", {lado: 10, girar: -15});
m.articulacao("pescoço", {girar: 30});
m.dedos("direita", {indicador: -0.2, mao: 0.8});
cena.modo("manequim");`,
  "Ginástica: ponte, parada e arabesque":`// poses de ginasta: o perfil "ginasta" amplia os limites; "apoiar" põe mãos e pés no chão
cena.limpar();
const a = cena.ativo.renomear("Ponte").poseRapida("ponte");
const b = cena.adicionar({nome: "Parada", x: 9}).poseRapida("paradaAbertura");
const c = cena.adicionar({nome: "Arabesque", x: 18}).poseRapida("arabesque");
cena.rosto("minimo");
camera.eixo("z").elevacao("média");
cena.enquadrar();`,
  "Blocking: profundidade e perspectiva":`// com perspectiva, a profundidade (distância até a câmera) decide o tamanho na foto
cena.limpar();
cena.ativo.renomear("Perto").posicao(-3, 6);
cena.adicionar({nome: "Meio", x: 2, z: -4});
cena.adicionar({nome: "Longe", x: 6, z: -18}).girar(-30);
camera.perspectiva(true).lente(35).mirar(0, -2, -4).colocar(-4, 2, 28);
log(cena.blocking().manequins.map(m => m.nome + ": " + m.profundidade + " m, " + m.naFoto + "% da altura").join("\n"));`,
  "Objetos: mesa, copo e cadeira":`// cada objeto tem uma cor só dele; "sobre" põe um em cima do outro
cena.limpar();
const mesa = cena.objeto("mesa", {x: 8, cor: "#7FA8E0"});
cena.objeto("copo", {sobre: "mesa"}).posicao(9, 1);
cena.objeto("cadeira", {x: 8, z: 5, giro: 180});
cena.objeto("cilindro", {x: -8, raio: 2, altura: 5});
mesa.mover(1, 0);            // o copo vai junto
log(cena.colisoes().map(c => c.descricao).join("\\n") || "nada atravessa nada");
cena.blocking.abrir();`,
  "Noite":`tema("escuro");`
};
let REF;

/* execução inicial deste módulo (na mesma ordem do app original) */
export function iniciarAjuda(){
  REF=`REFERÊNCIA
  cena.adicionar({nome, x, z, giro, corpo, pose, cor, contorno})  → novo manequim
  cena.copiar(m?) · cena.remover(m | "nome") · cena.limpar() · cena.lista()
  cena.obter(0 | "nome") · cena.ativo · cena.total · cena.enquadrar()
  
  m.posicao(x, z) · m.mover(dx, dz) · m.girar(graus) · m.renomear("nome")
  m.pose({joelhoEsq: 60, ...}) · m.poseRapida("caminhando") · m.corpo("musculoso" | {musculo: 0.8})
  m.cor("#preenchimento", "#contorno") · m.cor() = automática · m.copiar() · m.remover() · m.info()
  
  camera.posicao(x, y, z) · camera.mirar(x, y, z) · camera.girar(yaw, pitch, roll)
  camera.zoom(z) · camera.perspectiva(true, distância) · camera.distancia(R) · camera.luz(azimute, elevação) · camera.enquadrar()
  camera.lente(mm) — 18–35 grande-angular, 50 normal, 85–200 tele · camera.alturaOlhos(R acima do chão, inclinação?) — manequim ≈ 16 R
  cena.horizonte(true) · cena.sombras(true) · cena.atmosfera(0..1)
  cena.modo("ecorche" | "manequim" | "construcao") · cena.fibras(true)   — écorché: músculos com linhas de borda e tons planos
  Perspectiva: quem está longe fica menor, mais alto na tela (perto do horizonte), com traço mais fino e cor mais clara.
  Camadas (cada manequim é uma foto .svg na câmera da cena; só a que muda é refeita):
  m.congelar() · m.descongelar() · m.ocultar() · m.mostrar() · m.frente() · m.tras() · m.ordemAuto() · m.foto() → SVG só dele
  cena.camadas() → ordem e estado · cena.exportarCamadas() → SVG com uma camada por manequim · cena.exato(true) = todos juntos (mais lento)
  Colisões (um manequim atravessando outro):
  cena.colisoes() → lista · cena.resolverColisoes({preferir: "auto" | "distancia" | "giro" | "pose"}) · cena.desfazerColisao()
  cena.colisao("avisar" | "corrigir" | "bloquear" | "desligado", "auto" | "distancia" | "giro" | "pose")
  m.resolverColisoes("pose") — só este muda · m.permitirContato(outro, true) — abraço, aperto de mão
  cena.composicao(true) → avisa tangências e cabeças escondidas (só na tela) · cena.ajustarComposicao(0)
  Esqueleto e articulações (limites do corpo humano; acima do limite, ajusta e avisa):
  m.articulacao("cotovelo esquerdo", {dobrar: 90}) — nomes: ombro, cotovelo, punho, mao, quadril, joelho, tornozelo (+ esquerdo/direito),
    coluna, lombar, toracica, pescoco, cabeca, pelve, corpo; movimentos: dobrar, frente, abrir, girar, lado, inclinar, desvio, apontar, virar, subir
  m.gesto("direita" | "esquerda" | "ambas", "punho" | "apontar" | "pinca" | "joinha" | "paz" | "ok" | "garra" | "acenar" | …)
  m.dedos("esquerda", {polegar, indicador, medio, anelar, minimo, mao, afastar, opor}) · m.espelhar() · m.copiarPose(outro)
  m.flexibilidade("normal" | "atleta" | "ginasta" | "contorcionista") — amplia os limites (ponte, espacate, arabesque pedem "ginasta")
  m.apoiar("maos pes" | "maos" | "maos joelhos" | "mao esquerda pe direito") — vários pontos no chão ao mesmo tempo (ponte, parada de mão, prancha)
  Poses de ginasta: ponte, ponteUmaPerna, paradaAbertura, escorpiao, arabesque, espacateSaltado, camelo, agachamentoProfundo, prancha, quatroApoios
  Blocking (painel ao lado do palco): vista de cima (X/Z) e lateral sincronizadas com a cena — + Manequim / + Objeto (clique para colocar), arraste, gire, mude o tamanho
  cena.blocking() — posições em metros (manequins e objetos), profundidade, % da foto, cores e colisões · camera.posicaoMundo() · camera.colocar(x, y, z) (mantém o alvo)
  cena.blocking.abrir() · .fechar() · .recolher() · .destacar("painel" | "cima" | "lateral") · .flutuar() · .devolver() · .lateral("camera" | "frente" | "direita" | graus) · .inserir("mesa") · .estado()
  cena.selecionar("Ana" | 0 | "mesa") — o mesmo que clicar na lista do painel
  Zoom óptico (a câmera fica parada): camera.zoomLente(85) · camera.zoomLente("2x") · camera.campo(60) (graus) · camera.lenteInfo() — no painel: −/+, roda sobre o cone, teclas + e −; no palco: Alt + roda
  camera.lente(mm) muda a lente e afasta/aproxima para manter o tamanho; camera.lente(mm, false) = zoomLente
  cena.pontosDeFugaObjetos(true) — guias das arestas dos objetos até os pontos de fuga deles (objetos girados têm os próprios; com a câmera inclinada, o terceiro ponto)
  cena.linhasOcultas(0..1) — opacidade das linhas atrás do corpo · cena.rosto("completo" | "minimo" | "liso")
  Cena por código (eixos do mundo: x = lado, y = altura, z = profundidade; a câmera padrão olha de +z):
  m.orientar("+x" | "-z" | "câmera" | graus | "Ana") · m.deitar("costas" | "bruços" | "lado", eixo da cabeça)
  m.saltar(altura R) · m.altura(R) · m.inclinar(graus, rolar?) — corpo inteiro (−90 costas, 90 bruços, 180 de cabeça para baixo)
  m.sentar(objeto?) · m.subir(objeto) · m.encostar(objeto) · m.olhar("baixo" | "cima" | "câmera" | "Ana" | [x,y,z])
  m.maoEm("esquerda", [x, y, z]) · m.peEm("direita", [x, y, z]) · m.apontar(alvo, "direita")
  cena.objeto(tipo, {x, z, giro, largura, profundidade, altura, raio, cor, sobre}) — caixas: banco, cadeira, caixa, cubo, degrau, mesa, cama, parede; cilindros: cilindro, copo, coluna, barril, "mesa redonda"
  o.posicao(x, z) · o.mover(dx, dz) · o.girar(graus) · o.medidas({altura, raio…}) · o.cor("#RRGGBB" | "auto") (exclusiva) · o.sobre("mesa" | null | "auto") · o.duplicar() · o.renomear() · o.remover() · o.info()
  cena.objetos() · cena.obterObjeto("mesa") · cena.removerObjeto("mesa") · cena.tiposDeObjeto() — colisões de objeto × objeto e manequim × objeto em cena.colisoes()
  cena.montar([{pose: "sentado"}, {deitar: {tipo: "costas", eixo: "x"}}, {pose: "saltando", altura: 4, olhar: "baixo"}], {camera: {eixo: "z", elevacao: "alta"}})
  cena.descrever("manequim 1 sentado, manequim 2 deitado ao longo do eixo x, câmera no eixo z, elevação alta")
  camera.eixo("x" | "-x" | "z" | "-z" | "y") · camera.elevacao("alta" | "muito alta" | "média" | "olhos" | "baixa" | "muito baixa" | graus) · camera.plano("plongée" | "contra-plongée" | "de cima")
  tema("claro" | "escuro" | "sistema") · log(...)
  
  Poses rápidas: ${todasPoses().join(", ")}
  Tipos corporais: ${Object.keys(BODIES).join(", ")}
  Parâmetros de pose e corpo: ${Object.keys(ALIAS).join(", ")}
  (também valem os nomes internos, como kneeFlexL)`;
}

export { EXAMPLES, REF };
