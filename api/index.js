import { buildApp } from '../src/server.js';

let app;

export function dispatchToFastify(server, req, res) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const fail = error => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    res.once('finish', finish);
    res.once('close', finish);
    res.once('error', fail);
    server.emit('request', req, res);
  });
}

export default async function handler(req, res) {
  if (!app) {
    app = await buildApp({ logger: false });
    await app.ready();
  }
  // O handler da Vercel precisa permanecer ativo até Fastify terminar a resposta.
  // Caso contrário, rotas assíncronas podem chegar ao waitUntil() somente depois
  // que o contexto da função já foi encerrado.
  await dispatchToFastify(app.server, req, res);
}
