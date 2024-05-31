const jwt = require('jsonwebtoken');

const HttpError = require('../models/http-error');

const checkAuth = (req, _, next) => {
  if (req.method === 'OPTIONS') {
    return next();
  }

  try {
    if (!req.headers.authorization) {
      throw new HttpError('Authentication failed', 401);
    }

    const token = req.headers.authorization.split(' ')[1];

    if (!token) {
      throw new HttpError('Authentication failed', 401);
    }

    const decodedToken = jwt.verify(token, process.env.JWT_KEY);

    req.user = { id: decodedToken.userId };

    next();
  } catch (e) {
    return next(new HttpError(e.message, e.code, e.errors));
  }
};

module.exports = checkAuth;
