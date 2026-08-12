import { buildApp } from '../src/server.js';

let app;

export default async function handler(req, res) {
  if (!app) {
    app = await buildApp({ logger: false });
    await app.ready();
  }
  app.server.emit('request', req, res);
}
