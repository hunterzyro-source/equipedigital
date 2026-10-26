const app = require('../server');

module.exports = (req, res) => {
  const incoming = new URL(req.url || '/', 'http://localhost');
  const rerouted = incoming.searchParams.get('__route');
  if (rerouted) {
    incoming.searchParams.delete('__route');
    req.url = `/${rerouted}${incoming.search ? incoming.search : ''}`;
  }
  return app(req, res);
};
