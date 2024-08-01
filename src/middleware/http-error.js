const fs = require('fs');

const HttpError = require('../models/http-error');

/**
 * Global error handling fn.
 * @param {Object} error
 * @param {Object} req
 * @param {Object} res
 * @param {Function} next
 * @returns response with error message, error code and error data
 */
const httpError = (error, req, res, next) => {
  // checking if response has already been sent
  if (res.headerSent) {
    return next(error);
  }

  const response = {
    message: error.message,
    status: error.code,
    errors: error.errors,
  };

  res.status(error.code).json(response);
};

/**
 * Throw an error with the status 404 if router was not found.
 */
const notFoundError = () => {
  throw new HttpError('Could not load the content you wanna see', 404);
};

module.exports.httpError = httpError;
module.exports.notFoundError = notFoundError;
