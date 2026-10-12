'use strict';

module.exports = function requestLogger(req, res, next) {
  const startedAt = Date.now();
  res.on('finish', () => {
    console.log(
      `[mock-api] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - startedAt}ms)`,
    );
  });
  next();
};
