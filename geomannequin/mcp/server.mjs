#!/usr/bin/env node
/* GeoMannequin MCP
   node server.mjs           → stdio (Claude Desktop, Claude Code, outros clientes locais)
   node server.mjs --http    → HTTP remoto (claude.ai, ChatGPT): POST/GET/DELETE /mcp  (+ /sse legado)
   Variáveis: PORT, GM_TOKEN (senha opcional), GM_ALLOW_CODE=1 (liga executar_codigo no modo HTTP),
              GM_APP_URL (endereço do app), GM_MAX_SESSIONS, GM_SESSION_TTL_MIN */
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createWorld, appMeta } from "./lib/core.mjs";
import { registerAll } from "./lib/tools.mjs";
import { APP_URL } from "./lib/scene.mjs";

const VERSION = "1.0.0";
const INSTRUCTIONS = `GeoMannequin monta cenas de manequins anatômicos (referência para desenho) em perspectiva.
Fluxo típico: nova_cena → adicionar_manequim / editar_manequim (poses, corpo, posição no chão em R; o manequim tem ≈ 16 R) → camera (lente, altura_olhos) → aparencia_cena (sombras, horizonte, tema escuro) → renderizar para ver a imagem e o link do app.
Use referencia para os nomes de poses e parâmetros. Cada manequim tem cor exclusiva. Responda ao usuário em português, mostrando o link do app.`;

function makeServer(getWorld, opts) {
  const s = new McpServer({ name: "geomannequin", title: "GeoMannequin", version: VERSION }, { instructions: INSTRUCTIONS, capabilities: { logging: {} } });
  registerAll(s, getWorld, opts);
  return s;
}

const args = process.argv.slice(2);
const httpMode = args.includes("--http") || !!process.env.PORT && !args.includes("--stdio");

if (!httpMode) {
  /* local: uma cena por processo; código liberado (roda na máquina do próprio usuário) */
  const world = createWorld();
  const server = makeServer(() => world, { allowCode: process.env.GM_ALLOW_CODE !== "0" });
  await server.connect(new StdioServerTransport());
  process.stderr.write(`GeoMannequin MCP ${VERSION} (stdio) pronto. App: ${APP_URL}\n`);
} else {
  const { default: express } = await import("express");
  const PORT = Number(process.env.PORT || 8787);
  const TOKEN = process.env.GM_TOKEN || "";
  const MAX = Number(process.env.GM_MAX_SESSIONS || 200);
  const TTL = Number(process.env.GM_SESSION_TTL_MIN || 45) * 60e3;
  const opts = { allowCode: process.env.GM_ALLOW_CODE === "1" };
  const sessions = new Map(); // id → {transport, server, world, last}

  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "2mb" }));
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID");
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });
  const authed = (req) => {
    if (!TOKEN) return true;
    const h = req.headers.authorization || "";
    return h === "Bearer " + TOKEN || req.query.token === TOKEN;
  };
  const deny = (res) => res.status(401).json({ jsonrpc: "2.0", error: { code: -32001, message: "Token inválido ou ausente (use ?token=… no endereço ou Authorization: Bearer …)." }, id: null });

  function evict() {
    const now = Date.now();
    for (const [id, s] of sessions) if (now - s.last > TTL) { try { s.transport.close(); } catch { } sessions.delete(id); }
    while (sessions.size >= MAX) { const [id, s] = [...sessions.entries()].sort((a, b) => a[1].last - b[1].last)[0]; try { s.transport.close(); } catch { } sessions.delete(id); }
  }
  setInterval(evict, 60e3).unref();

  app.get("/", (req, res) => res.json({ nome: "GeoMannequin MCP", versao: VERSION, mcp: "/mcp", sse_legado: "/sse", app: APP_URL, sessoes: sessions.size, codigo_liberado: opts.allowCode, protegido_por_token: !!TOKEN, motor: appMeta() && { bytes: appMeta().bytes } }));
  app.get("/healthz", (req, res) => res.send("ok"));

  /* Streamable HTTP */
  app.post("/mcp", async (req, res) => {
    if (!authed(req)) return deny(res);
    try {
      const sid = req.headers["mcp-session-id"];
      let s = sid && sessions.get(sid);
      if (!s) {
        if (sid || !isInitializeRequest(req.body)) return res.status(sid ? 404 : 400).json({ jsonrpc: "2.0", error: { code: -32000, message: sid ? "Sessão expirada; reconecte." : "Requisição sem sessão: comece com initialize." }, id: null });
        evict();
        const world = createWorld();
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (id) => sessions.set(id, s)
        });
        const server = makeServer(() => world, opts);
        s = { transport, server, world, last: Date.now() };
        transport.onclose = () => { if (transport.sessionId) sessions.delete(transport.sessionId); };
        await server.connect(transport);
      }
      s.last = Date.now();
      await s.transport.handleRequest(req, res, req.body);
    } catch (e) {
      console.error(e);
      if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Erro interno." }, id: null });
    }
  });
  const viaSession = async (req, res) => {
    if (!authed(req)) return deny(res);
    const s = sessions.get(req.headers["mcp-session-id"]);
    if (!s) return res.status(404).send("Sessão não encontrada.");
    s.last = Date.now();
    await s.transport.handleRequest(req, res);
  };
  app.get("/mcp", viaSession);
  app.delete("/mcp", viaSession);

  /* SSE legado (clientes antigos) */
  const sse = new Map();
  app.get("/sse", async (req, res) => {
    if (!authed(req)) return deny(res);
    evict();
    const world = createWorld();
    const transport = new SSEServerTransport("/messages" + (TOKEN ? "?token=" + encodeURIComponent(TOKEN) : ""), res);
    const server = makeServer(() => world, opts);
    sse.set(transport.sessionId, transport);
    res.on("close", () => sse.delete(transport.sessionId));
    await server.connect(transport);
  });
  app.post("/messages", async (req, res) => {
    if (!authed(req)) return deny(res);
    const t = sse.get(String(req.query.sessionId || ""));
    if (!t) return res.status(404).send("Sessão SSE não encontrada.");
    await t.handlePostMessage(req, res, req.body);
  });

  app.listen(PORT, "0.0.0.0", () => console.log(`GeoMannequin MCP ${VERSION} (HTTP) em http://0.0.0.0:${PORT}/mcp — app ${APP_URL}${TOKEN ? " — com token" : ""}`));
}
