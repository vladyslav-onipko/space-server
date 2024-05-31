/**
 * Set required headers fn.
 * @param {Object} req
 * @param {Object} res
 * @param {Function} next
 */
const responseHeaders = (_, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Accept, Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');

  next();
};

module.exports = responseHeaders;
