/* GeoMannequin — exemplos de código e referência da API */
import { BODIES, BPOSES } from "./poses.js";
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
  tema("claro" | "escuro" | "sistema") · log(...)
  
  Poses rápidas: ${Object.keys(BPOSES).concat(["cintura","cruzar","ombro"]).join(", ")}
  Tipos corporais: ${Object.keys(BODIES).join(", ")}
  Parâmetros de pose e corpo: ${Object.keys(ALIAS).join(", ")}
  (também valem os nomes internos, como kneeFlexL)`;
}

export { EXAMPLES, REF };
