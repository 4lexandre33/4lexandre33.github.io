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
  "Giro em volta da Ana (órbita)":`// a câmera gira em volta de um pivô; o azimute conta a partir da frente dele
cena.limpar();
const ana = cena.ativo.renomear("Ana").posicao(3, 0).girar(40).poseRapida("acenando");
cena.objeto("mesa", { x: -5, z: 0 });
camera.perspectiva(true).orbitar("Ana", { azimute: "3/4 esquerda", elevacao: 12 });
log(camera.vista());
// outras: camera.orbitar("mesa", "costas") · camera.orbitar("cena", {azimute: 30, elevacao: 30})`,
  "Órbita detalhada: cabeça, mãos e objeto":`// A região é o pivô; ângulo e elevação permanecem independentes.
cena.limpar();
cena.ativo.renomear("Ana").poseRapida("acenando");
cena.objeto("caixa", {nome:"Caixa", x:5, altura:4});
camera.orbitar("Ana", {area:"cabeca", azimute:"3/4 esquerda", elevacao:25});
log(camera.vista());
camera.area("mao esquerda"); // ajusta o foco preservando o ângulo
camera.focar("Caixa", "superior", {azimute:45, elevacao:60, folga:0.9});`,
  "Luta com efeitos (mangá)":`// soco de fogo: aura, arco do golpe, impacto, pós-imagem de quem cai, linhas de concentração e onomatopeia
cena.limpar();
const a = cena.ativo.renomear("Ana").poseRapida("socando").girar(90).expressao("raiva");
const b = cena.adicionar({ nome: "Leo", x: 9, z: 0 }).girar(-90).poseRapida("caindo").expressao("dor");
a.efeito("aura", { elemento: "fogo", intensidade: 0.8 });
a.efeito("arco_movimento", { em: "maoDir", elemento: "fogo" });
efeito("impacto_contato", { em: "Leo.rosto", elemento: "raio" });
b.efeito("pos_imagem", { para: 0 });
efeito("concentracao", { camada: "fundo" });
efeito("onomatopeia", { texto: "BAM!", em: { modo: "tela", x: 0.72, y: 0.18 } });
camera.girar(20, 8); camera.enquadrar();`,
  "Magia com efeitos (anime)":`// conjuração: círculo de runas, feixe de gelo com anéis até a parede, que racha
cena.limpar();
const m = cena.ativo.poseRapida("apontando").girar(90).expressao("determinacao");
cena.objeto("parede", { x: 16, z: -2, giro: 90 });
m.efeito("circulo_magico", { em: "pes", elemento: "gelo", raio: 5 });
m.efeito("feixe", { em: "maoDir", para: { objeto: "parede" }, elemento: "gelo", aneis: 4 });
efeito("parede_quebrada", { em: { objeto: "parede" } });
efeito("cristais_chao", { em: "pes", elemento: "cristal", para: [1, 0, 0] });
camera.girar(-35, 10); camera.mirar(8, 6, 0); camera.distancia(75);`,
  "Mãos, dedos e rosto":`// cada falange, o dedão do pé, a mandíbula, o olhar e as expressões
cena.limpar();
const m = cena.ativo;
m.poseRapida("acenando").gesto("esquerda", "vulcano");
m.articulacao("indicador direito", { base: 1, ponta: 0.2 }).articulacao("polegar direito", { opor: 1, base: 0.6 });
m.expressao("surpresa").olhos(0.6, 0.1);
m.articulacao("dedão esquerdo", { dobrar: -25 });
log(m.validarPose());
camera.enquadramento("primeiro plano");`,
  "Câmera atrás do tronco":`const m=cena.ativo.renomear("Ana");
m.girar(75);
camera.costas("Ana",{referencia:"tronco",elevacao:0,enquadrar:true});
log(camera.vista());`,
  "Nuca da cabeça mesmo com pescoço girado":`const m=cena.ativo.renomear("Ana");
m.pose({headYaw:60,neckTwist:20});
camera.costas("Ana",{referencia:"cabeca",area:"cabeca",elevacao:5});
log("Eixos da cabeça:",camera.orientacaoDoAlvo("Ana","cabeca"));`,
  "Câmera segue a rotação":`const ana=cena.ativo.renomear("Ana");
camera.seguir("Ana",{lado:"costas",referencia:"tronco",elevacao:0});
ana.girar(95).mover(3,2);
log(camera.seguimento());
camera.pararSeguir();`,
  "Objetos: definir a frente":`const cubo=cena.objeto("cubo",{nome:"Cubo para orientar",x:6,giro:40});
cubo.orientacao({frenteLocal:[0,0,1],cimaLocal:[0,1,0]});
camera.costas("Cubo para orientar",{area:"superior",elevacao:15});`,
  "Somente comandos: estilos, camadas, arquivos":`cena.estilo("lapis");
cena.camadaVisual("grid",false);
cena.camadaVisual("eyes",true);
const svg=cena.exportarSVG();
log("SVG:",svg.length,"caracteres");
log("Comandos disponíveis:",cena.comandos().camera);
log("Capacidades:",cena.capacidades());`,
  "Download com await (navegador)":`const svg=cena.exportarSVG();
await cena.baixar("minha-cena.svg",svg,"image/svg+xml");
const png=await cena.exportarPNG({escala:2});
await cena.baixar("minha-cena.png",png,"image/png");`,
  "Grupo orientado por um líder":`const ana=cena.ativo.renomear("Ana");
const bruno=cena.adicionar({nome:"Bruno",x:5,giro:180});
camera.ver(["Ana","Bruno"],{lider:"Ana",lado:"costas",elevacao:10,enquadrar:true});
log(camera.vista());`,
  "Oito vistas em SVG sem alterar a cena":`const ana=cena.ativo.renomear("Ana");
const fotos=camera.capturarVistas("Ana",{referencia:"cabeca",area:"cabeca"});
log(fotos.map(f=>f.azimute));
await cena.baixar("nuca.svg",fotos.find(f=>f.azimute===180).svg,"image/svg+xml");`,
  "ZIP com camadas via código":`const zip=cena.exportarZIP();
await cena.baixar("geomannequin-camadas.zip",zip,"application/zip");
log(zip.length,"bytes");`,
  "Parâmetros individuais":`const m=cena.ativo;
m.parametro("headYaw",45).parametro("eyeYaw",0.3);
camera.parametro("lens",85);
log("Parâmetros da cabeça:",m.parametro("headYaw"));
log("Controles disponíveis:",cena.parametros());`,
  "Segurar cadeira pelo encosto (V3)":`// Cadeira segue o braço em posição e rotação 3D.
const ana=cena.ativo.renomear("Ana");
const cadeira=cena.objeto("cadeira",{nome:"Cadeira 1",x:2,z:0});
log(cadeira.pontosDeAgarre().map(p=>p.id));
// Posicione a mão perto do encosto. Para teste, alcance amplo:
const grip=cena.segurarObjeto("Cadeira 1",{
  manequim:"Ana",mao:"direita",ponto:"encostoTopo",reach:20
});
log(grip);
ana.parametro("armFlexR",55);
ana.parametro("elbowR",70);
log(cena.inspecionarPreensao());`,
  "Aproximar mão e agarrar":`const ana=cena.ativo.renomear("Ana");
cena.objeto("cadeira",{nome:"Cadeira",x:2,z:0});
const resultado=ana.maoEmSite("Cadeira","encostoTopo",{mao:"direita"});
log(resultado);
if(resultado.alcançou){
  ana.segurar("Cadeira",{mao:"direita",ponto:"encostoTopo",reach:1});
}`,
  "Segurar e soltar cadeira sem teleporte":`const ana=cena.ativo.renomear("Ana");
cena.objeto("cadeira",{nome:"Cadeira",x:2,z:0});
ana.segurar("Cadeira",{mao:"direita",ponto:"encostoTopo",reach:20});
ana.parametro("armFlexR",40);
ana.soltar("Cadeira",{modo:"manter"});
log(cena.obterObjeto("Cadeira").info());`,
  "Segurar cadeira com duas mãos":`const a=cena.ativo.renomear("Ana");
cena.objeto("cadeira",{nome:"Cadeira",x:1,z:0});
cena.segurarObjeto("Cadeira",{mao:"direita",ponto:"encostoDireito",reach:20});
cena.segurarObjeto("Cadeira",{mao:"esquerda",ponto:"encostoEsquerdo",reach:20,segunda:true});
log(cena.vinculos());
// Enquanto não existe solver bilateral, a mão primária conduz o objeto.
cena.soltarObjeto("Cadeira",{mao:"direita"});
log(cena.vinculos());`,
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
  m.descanso() — volta à pose de descanso em pé (mantém biotipo, rosto e posição) · m.descanso({rosto: true}) · cena.descanso() — todos
  m.cor("#preenchimento", "#contorno") · m.cor() = automática · m.copiar() · m.remover() · m.info()
  
  NOVO: camera.costas("Ana",{referencia:"tronco",area:"cabeca",elevacao:0}) — vista das costas do tronco
  camera.costas("Ana",{referencia:"cabeca",area:"cabeca"}) — nuca orientada pela cabeça, não pela presença de olhos
  camera.ver("Ana",{lado:"3/4 esquerda",referencia:"cabeca",vertical:"anatomico"})
  camera.seguir("Ana",{lado:"costas",referencia:"tronco"}) · camera.pararSeguir() · camera.seguimento()
  camera.orientacaoDoAlvo("Ana","cabeca") · camera.alvos() · camera.areas("Ana") · camera.vista()
  Objetos: cena.obterObjeto("cubo").orientacao({frenteLocal:[0,0,1],cimaLocal:[0,1,0]})
  Estilo: cena.estilos() · cena.estilo("lapis") · cena.estiloAtual()
  Camadas: cena.camadasVisuais() · cena.camadaVisual("grid",false) · cena.camadaVisual("eyes",true)
  Arquivos: cena.exportarSVG() · cena.exportarOBJ({modelo:"v4"}) · cena.exportarJSON() · cena.importarJSON(json)
  IA sem MCP (Gemini, ChatGPT, Claude): cena.manualIA() — manual completo de poses · cena.estadoIA() — como cada parte do corpo está (texto; {json:true} = objeto)
    cena.pacoteIA("o que eu quero") — manual + estado + pedido para colar na IA · m.estadoIA() — só este manequim · painel “Usar com uma IA” embaixo do editor
  Efeitos: padrão em preto e branco; {colorido: true} liga a cor · {nivel: 1..5} força · cena.efeitos.colorir(false) · cena.efeitos.tamanho(id) → alturas do corpo
    onomatopeia em katakana: cena.efeito("onomatopeia", {texto: "ドッ"}) · chão (cratera, círculo, rachaduras) fica abaixo dos manequins
  Exportação navegador: await cena.exportarPNG({escala:2}); await cena.baixar("cena.png",png,"image/png")
  Parâmetros: m.parametro("headYaw",45) · m.parametros() · camera.parametro("lens",85) · camera.parametros()
  Câmera sem alterar a ativa: camera.capturar("Ana",{lado:"costas"}) · camera.capturarVistas("Ana")
  Grupo: camera.ver(["Ana","Bruno"],{lider:"Ana",lado:"costas"}) (sem orientação média inventada)
  Seção da pega: obj.medidasDaBase() · obj.mostrarBase("guia") · obj.mostrarBase("modelo")
  Modelos na mão: cena.objetoNaMao("cadeira",{mao:"direita"}) · modelos mesa, bastao, cajado, espada, circular e retangular
  Roupa e cabelo: cena.referencia("paleto",{cor:"#354962"}) · cena.referencia("longo",{raizes:[{angulo:90,altura:.8,comprimento:2}]})
  Efeitos especiais: cena.efeito("explosao", {em: {chao: true, x: 4, z: 0}, elemento: "fogo", raio: 5}) · efeito(...) direto no editor e nos quadros
    m.efeito("aura", {elemento: "vazio"}) · m.efeito("feixe", {em: "maoDir", para: "Leo", elemento: "raio"}) · cena.efeito("concentracao") (centra no personagem)
    em: parte do manequim ("maoDir", "Ana.punhoEsq", "olhos", "pes"…) · {chao: true, x, z} · {x, y, z} (y = altura) · {objeto: "parede"} · {modo: "tela", x, y}
    para: (sem nada = pela pose) · "Leo" · {alvo: "auto"} (o mais perto) · [x, y, z] · graus na tela · "camera"
    opções: elemento (fogo, gelo, raio, vento, vazio, sagrado, prisma, cristal, terra, sombra, tinta) · cores · escala · intensidade · progresso 0–1 · reverso · camada (auto, atras, frente, fundo) · semente · inicio/duracao
    cena.efeitos.lista() · .editar(id, {...}) · .remover(id) · .duplicar(id) · .catalogo() · .salvarModelo(id, "nome") · .usarModelo("nome", {em: "maoEsq"}) · .converterAntigos()
    personalizado: cena.efeito("personalizado", {svg: "<circle r='30' fill='#f60'/>"}) · no app também {codigo: "return fx.forma(fx.circulo(fx.x, fx.y, 20), fx.cores[1])"}
  Efeitos antigos (PR #20): cena.referencia("impacto",{inicio:8,duracao:12}) · cena.amostrarRastro(indice,{mao:"direita"})
  Vento por quadro: cena.ventoChave(24,{x:1,z:0,rajada:.4}) · cena.ventoChave(48,{x:-1,z:0})
  Vento e tempo: cena.vento({x:1,z:0,rajada:.4}) · cena.quadroSimulado(12)
  Camadas de referência: cena.referencias() · cena.referencia("paleto",{indice:0,ativo:false}) · cena.removerReferencia(0)
  Preensão V3: m.segurar("Cadeira",{mao:"direita",ponto:"encostoTopo",reach:5}) — mão move cadeira em 3D
  m.maoEmSite("Cadeira","encostoTopo",{mao:"direita"}) — aproximar usando IK
  m.soltar("Cadeira",{modo:"manter"}) — deixar onde está, sem simular gravidade
  cena.vinculos() · cena.inspecionarPreensao() · obj.pontosDeAgarre() · obj.emPosseDe()
  Objetos: pontos 'encostoTopo', 'encostoEsquerdo', 'encostoDireito', 'assentoFrente'
  Compatibilidade: cena.segurarObjeto("Copo",{motor:"v2",mao:"direita"}) ativa a preensão antiga
  Duas mãos: segunda:true adiciona âncora auxiliar; solver bilateral exato continua pendente
  Arquivo ZIP: const zip=cena.exportarZIP(); await cena.baixar("camadas.zip",zip,"application/zip")
  Folha V4.2: cena.estudoAnatomico.svg() · cena.estudoAnatomico.abrir() · .atualizar() · .fechar()
  Descoberta: cena.comandos() · cena.capacidades() · cena.parametros()
  Histórico: cena.marcarEstado() · cena.desfazer() · cena.refazer() · cena.historico()
  Observação: o executor aceita await, mas não é um sandbox de segurança; execute scripts confiáveis.
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
  pose({cotoveloDir: 70, bracoDirAbrir: 80}) · pose("Aceno", {...}) · pose("Aceno") — vale para o manequim ativo; é o mesmo texto do painel "Código da pose"
  m.codigoPose({partes: "bracoDir", soMudancas: true}) → texto · m.aplicarPose(texto | "nome salvo", {partes, espelhar}) · m.salvarPose("Aceno", {partes})
  cena.poses.lista() · .salvar(nome, {manequim, partes}) · .aplicar(nome, {manequim, partes, espelhar}) · .codigo(nome) · .exportar() · .importar(texto) · .renomear(n, novo) · .apagar(n) · .duplicar(n)
    partes: corpo, tronco, cabeca, rosto, bracoEsq, bracoDir, maoEsq, maoDir, pernaEsq, pernaDir (ou bracos, maos, pernas, esquerda, direita)
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
  Quadros de mangá/quadrinhos: camera.enquadramento("detalhe" | "close" | "primeiro plano" | "medio" | "americano" | "inteiro" | "geral", "Ana" | ["Ana","Leo"] | "todos", {tercos: "esquerda"})
  camera.angulo("normal" | "plongée" | "contra-plongée" | "zenital" | "nadir" | "holandês", graus) · cena.estado() / cena.restaurar(estado)
  Roteiro de quadros (botão "Quadros"): #cena (preparação) · #quadro 1 — título · #quadro 2 novo 16:9 · // fala: Ana: Oi! — cada quadro continua do anterior;
    Renderizar monta e fotografa cada quadro, a fila guarda em ordem e "Baixar tudo" gera um .zip (quadro, contorno, OpenPose, profundidade, normais, máscara, partes, canny, cena.json)
    cena.quadros.abrir() · .texto("#quadro 1 …") · .renderizar() · .fila() · .baixar()
    No roteiro: #orbita "Ana" 8 elevacao 10 16:9 — 8 quadros girando em volta (turntable) · #ficha "Ana" [completa] [orto] — frente, 3/4, perfil e costas
    Passes de cada quadro (ControlNet): contorno, OpenPose completo (BODY_25 + mãos 21 + rosto 70, confiança 0,5 = escondido; openpose-corpo.png só o corpo),
    profundidade, normais, máscara por item, partes do corpo (14 cores + legenda) e bordas (canny) — profundidade/máscara/partes em 1 px
  Órbita (a câmera gira em volta de um pivô: manequim, grupo, objeto, ponto ou a cena):
  camera.orbitar("Ana", {azimute: "frente" | "3/4 esquerda" | "esquerda" | "3/4 costas esquerda" | "costas" | "3/4 costas direita" | "direita" | "3/4 direita" | graus, elevacao: graus | "olhos" | "alta", distancia?})
  camera.orbitar(["Ana","Leo"], "costas") · camera.orbitar("mesa", 45) · camera.orbitar("cena", {azimute: 30, elevacao: 25}) · camera.orbitar([0, -7, 0], 90)
  Foco local: camera.orbitar("Ana", {area:"cabeca", azimute:45, elevacao:20, folga:0.9}) · camera.orbitar("Ana", {area:"mao direita", azimute:-45, elevacao:10})
  Objetos: camera.focar("mesa", "superior", {azimute:60, elevacao:40}) · camera.focar("caixa", "inferior") · camera.area("torso")
  No roteiro: #orbita "Ana" 8 area "mao esquerda" elevacao 25 — oito ângulos, mesma região focal
  camera.pivo("Ana", {area:"cabeca", enquadrar:true}) — a cabeça é o centro da órbita · camera.vista() → {pivo, area, azimute, elevacao}
  camera.girarEmVolta(15, 0) · camera.giro(8) → azimutes; o alvo mantém o foco ao mudar de posição ou pose
  Rig fino: m.articulacao("indicador esquerdo", {base: 0.8, ponta: 0.5, afastar: -0.3}) · ("polegar direito", {base, ponta, afastar, opor}) — de −1 a 1
    ("dedão esquerdo", {dobrar: 30}) · ("canela direita", {girar: 20}) · ("pé esquerdo", {aduzir: 10}) · ("escápula esquerda", {girar: 0.5, tensao: 1})
    ("mandíbula", {abrir: 0.5, lado: 0.2}) · ("olhos", {lado: 0.6, cima: -0.2, fechar: 0.3}) · ("sobrancelhas", {subir: 0.5, franzir: 0.4})
  m.expressao(nome, intensidade) — neutra, alegria, riso, surpresa, raiva, tristeza, choro, medo, grito, vergonha, sono, desconfianca, piscando,
    nojo, desprezo, determinacao, malicia, confusao, choque, tedio, dor, cansaco, admiracao, culpa, orgulho, pensativo, alivio (intensidade 0 a 1.5)
  Misturar: m.expressao({raiva: 0.6, tristeza: 0.4}, 1) ou m.expressao("60% raiva + 40% tristeza") · m.olhos(x, y) · m.boca(abrir, sorriso)
  m.rosto({...}) — unidades de ação do rosto, cada lado separado (somam por cima da expressão): sobrancelhaDentroEsq/Dir e sobrancelhaForaEsq/Dir (−1 a 1),
    palpebraEsq/Dir (piscar um olho), palpebraBaixoEsq/Dir (apertar), bochechaEsq/Dir, narizFranzir, labioCimaEsq/Dir (nojo), cantoBocaEsq/Dir (−1 a 1, desprezo),
    labiosApertar, beicinho, dentesCerrados, olheiras (0 a 1) · m.piscar("esq" | "dir") · funcionam em m.pose({...}) e no código da pose; "espelhar" troca o lado
  Na V5 as sobrancelhas mudam de forma com a emoção (V na raiva, arco na surpresa, aflição na tristeza) e aparecem rugas estilo mangá com a intensidade
    (entre as sobrancelhas, testa, pés de galinha, sulco nariz-boca, nariz, queixo enrugado, olheiras); o exagero controla quanto
  m.cabeca("v3" | "v5" | "v1" | "v2" | "v4") — V3 é a padrão; V5 = anime/mangá (olhos e boca grandes, expressões exageradas)
  m.corpo({olhosAnime: 1.75, bocaAnime: 1.7, exagero: 1}) · m.pose({corar: 1, lagrimas: 1}) — corado e lágrimas (desenhados na V5)
  Teclado (articulação escolhida no palco ou nas vistas): ←/→ ↑/↓ giram, PgUp/PgDn torção, Shift grande, Alt fino, Tab próxima, [ ] pai/filho, R zera, M outro lado, F foco, Esc solta, Ctrl+Z/Ctrl+Y
  cena.blocking.mover("articulacoes" | "manequim") · cena.blocking.foco("maoDir" | "cabeca" | "corpo" …) — quatro vistas do esqueleto (frente, lado, cima, isométrica)
  m.validarPose() → {ok, atravessa: [{partes, profundidade}], limites: [...]} — partes do corpo atravessando umas às outras e limites acoplados
  Gestos novos: chifres, telefone, gancho, mesa, vulcano, figa, cruzados
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
  Carregar e segurar: cena.objeto("pneu"|"saco"|"mala"|"vigaI"|"carrinhoDeMao"|… 42 tipos) · m.segurarComo("Pneu", "virarPneu", {mao, orientacao: "empe"|"deitado"|"diagonal"}) · cena.pegadas() lista as 36 ações
  Dois manequins: cena.interagir("Ana", "Leo", "abracoFrente"|"apertoDeMao"|"apoiandoFerido"|…) · cena.interacoes()
  Ação de luta: m.acao("socoCarregado", {lado, efeitos: true, rosto: true, colorido}) · cena.acoes() · m.molejo(0.6, semente) · poseRapida(nome, {molejo: 0})
  Funções narrativas: cena.poses.arvore() · cena.poses.porTag("Combate/Ataque") · cena.poses.etiquetar("Minha pose", ["Social/Afeto"])
  Muitos: cena.grade({n: 40, colunas: 8, espacamento: 6, x, z, poses: [...], olharPara: [x, z]}) · cena.arranjo("circulo"|"fila"|"arco"|"multidao", {...}) · cena.olharPara("todos"|"grupo:Nome", [x, z]) · cena.registro() · cena.separar() · cena.enquadrarTudo()
  Planta (imagem colorida): cena.dePlanta(cena.lerPlanta({w, h, data}), {linha: 0}) — no Blocking: "Planta → cena"
  Corpo: m.corpo("crianca"|"menino"|"menina") · m.pose({tamanho: 0.7, cinta: 1}) · rosto: eyeFocus (pupila minúscula), expressões iraFocada e focoTotal
  Efeito por camadas: cena.efeitos.criar([{forma: "fita", caminho: {tipo: "espiral", voltas: 2}, traco: {largura: 2, perfil: "fuso"}}], {em: "maoDir", estilo: "cel"}) · .prontos() · .construtor()
  
  Poses rápidas: ${todasPoses().join(", ")}
  Tipos corporais: ${Object.keys(BODIES).join(", ")}
  Parâmetros de pose e corpo: ${Object.keys(ALIAS).join(", ")}
  (também valem os nomes internos, como kneeFlexL)`;
}

export { EXAMPLES, REF };
