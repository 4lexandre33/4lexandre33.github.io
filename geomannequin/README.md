# GeoMannequin

Manequim anatômico paramétrico para referência de desenho, num único arquivo HTML.

- **App:** <https://4lexandre33.github.io/geomannequin/>
- **MCP para Claude, ChatGPT e Gemini:** pasta [`mcp/`](mcp/README.md)

Recursos: poses com limites anatômicos e cinemática inversa, vários manequins na mesma cena com cores exclusivas, perspectiva (lente, altura dos olhos, horizonte e pontos de fuga, sombras no chão, perspectiva atmosférica), modo noturno, editor de comandos em português, exportação SVG/JSON e link de cena (“Copiar link da cena”).

Para atualizar a página a partir do app em arquivo único:

```
node geomannequin/ferramentas/montar-pagina.mjs caminho/geomannequin.html
```
