/* GeoMannequin — cena, poses e comandos (sem depender da página): reúne os módulos e cria a cena inicial */
import "../engine/index.js";
import { iniciarModelo } from "./modelo.js";
import { iniciarModos } from "./modos.js";
import { iniciarParametros } from "./parametros.js";
import { iniciarAjuda } from "./ajuda.js";
export * from "./ambiente.js";
export * from "./paletas.js";
export * from "./parametros.js";
export * from "./modelo.js";
export * from "./tema.js";
export * from "./modos.js";
export * from "./estado.js";
export * from "./enquadrar.js";
export * from "./poses.js";
export * from "./camadas-cena.js";
export * from "./colisoes.js";
export * from "./comandos.js";
export * from "./ajuda.js";

iniciarModelo();
iniciarModos();
iniciarParametros();
iniciarAjuda();
