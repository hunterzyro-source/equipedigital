const app = require('../../server');

module.exports = (req, res) => {
  const incoming = new URL(req.url || '/', 'http://localhost');
  if (incoming.pathname.startsWith('/api/avatars/')) {
    incoming.pathname = incoming.pathname.replace(/^\/api\/avatars/, '/avatars');
    req.url = `${incoming.pathname}${incoming.search}`;
  }
  return app(req, res);
};
