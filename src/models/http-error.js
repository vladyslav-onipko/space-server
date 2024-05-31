/**
 * Class for generating an error.
 * @param {String} message - error message.
 * @param {Number} errorCode - status error code.
 * @param {Object} data - any additional information about error.
 */
class HttpError extends Error {
  constructor(message = 'Sorry, an unknown error occurred, we already fixing it!', errorCode = 500, data) {
    super(message);
    this.code = errorCode;
    this.errors = [];

    this.#addErrors(data);
  }

  #addErrors(data) {
    if (data && Array.isArray(data)) {
      data.forEach((error) => this.errors.push(error));
    } else if (data && !Array.isArray(data)) {
      this.errors.push(data);
    }
  }
}

module.exports = HttpError;
