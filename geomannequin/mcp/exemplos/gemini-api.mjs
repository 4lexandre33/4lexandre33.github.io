/* Usa o GeoMannequin MCP a partir da API do Gemini (SDK @google/genai).
   Preparação:  npm install @google/genai      (dentro da pasta mcp)
   Rodar:       GEMINI_API_KEY=sua-chave node exemplos/gemini-api.mjs "três manequins em fila, lente 35 mm"
   Opcional:    GEMINI_MODEL=nome-do-modelo   (padrão: gemini-2.5-flash) */
import { GoogleGenAI, mcpToTool } from "@google/genai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const server = join(dirname(fileURLToPath(import.meta.url)), "..", "server.mjs");
const pedido = process.argv.slice(2).join(" ") || "Monte três manequins em fila se afastando, câmera na altura dos olhos com lente de 35 mm, horizonte e sombras ligados, e desenhe a cena.";

const mcp = new Client({ name: "gemini-api-exemplo", version: "1.0.0" });
await mcp.connect(new StdioClientTransport({ command: process.execPath, args: [server] }));

const tool = mcpToTool(mcp);
if (process.argv.includes("--so-ferramentas") || !process.env.GEMINI_API_KEY) {
  /* sem chave: só mostra as ferramentas no formato que o Gemini recebe */
  const t = await tool.tool();
  console.log(JSON.stringify(t.functionDeclarations.map(f => f.name)));
  if (!process.env.GEMINI_API_KEY) console.log("Defina GEMINI_API_KEY para conversar com o Gemini.");
  await mcp.close();
  process.exit(0);
}
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const r = await ai.models.generateContent({
  model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  contents: pedido + "\nResponda em português e inclua o link do app GeoMannequin.",
  config: { tools: [tool] }
});
console.log(r.text);
await mcp.close();
