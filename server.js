import express from "express";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { scramjetPath } from "@mercuryworkshop/scramjet/path";
import { server as wisp } from "@mercuryworkshop/wisp-js/server";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const app = express();
const port = Number(process.env.PORT || 8080);
const dirOf = (specifier) => path.dirname(require.resolve(specifier));

app.disable("x-powered-by");
app.use((_request, response, next) => {
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  response.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  next();
});

app.use("/scram/", express.static(scramjetPath));
app.use("/utils/", express.static(dirOf("@mercuryworkshop/scramjet-utils")));
app.use("/controller/", express.static(dirOf("@mercuryworkshop/scramjet-controller")));
app.use("/libcurl/", express.static(dirOf("@mercuryworkshop/libcurl-transport")));
app.use("/epoxy/", express.static(dirOf("@mercuryworkshop/epoxy-transport")));
app.use("/lucide/", express.static(path.join(dirOf("lucide"), "..", "umd")));
app.use("/fonts/geist/", express.static(path.join(__dirname, "node_modules/geist/dist/fonts/geist-sans")));
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));

app.get("/api/favicon", async (request, response) => {
  const domain = String(request.query.domain || "");
  if (!/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(domain) || domain.length > 253) return response.sendStatus(400);
  try {
    const upstream = await fetch(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`, { signal: AbortSignal.timeout(6000) });
    if (!upstream.ok) return response.sendStatus(404);
    response.setHeader("Cache-Control", "public, max-age=86400");
    response.type(upstream.headers.get("content-type") || "image/png");
    response.send(Buffer.from(await upstream.arrayBuffer()));
  } catch { response.sendStatus(502); }
});

app.get("/health", (_request, response) => {
  response.json({ name: "Polestar", wisp: "/wisp/", status: "ready" });
});

const server = http.createServer(app);

server.on("upgrade", (request, socket, head) => {
  const proxyUrl = new URL(request.url ?? "/", `http://${request.headers.host}`);
  if (proxyUrl.pathname === "/wisp/") {
    wisp.routeRequest(request, socket, head);
  } else {
    socket.destroy();
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`✦ Polestar is ready on port ${port}`);
  console.log(`  Wisp transport mounted at /wisp/`);
});
