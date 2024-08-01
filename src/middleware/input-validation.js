const { body } = require('express-validator');

/**
 * Сheck user registration fields.
 * @returns {Array} validated fields.
 */
const checkUserSignup = () => {
  const name = body('name', 'Name must not be empty and contain at least 3 characters')
    .trim()
    .not()
    .isEmpty()
    .isLength({ min: 3 });

  const email = body('email', 'Email entered incorrectly').trim().not().isEmpty().normalizeEmail().isEmail();

  const password = body('password', 'Password must not be empty and contain at least 6 characters')
    .trim()
    .not()
    .isEmpty()
    .isLength({ min: 6 });

  const image = body('image', 'Image must not be empty').trim().not().isEmpty();

  return [name, email, password, image];
};

/**
 * Сheck user registration fields.
 * @returns {Array} validated fields.
 */
const checkUserUpdate = () => {
  const name = body('name', 'Name must not be empty and contain at least 3 characters')
    .trim()
    .not()
    .isEmpty()
    .isLength({ min: 3 });

  const image = body('image', 'Image must not be empty').trim().not().isEmpty();

  return [name, image];
};

const checkPlaceUpdate = () => {
  const title = body('title', 'Title must not be empty and contain at least 3 characters')
    .trim()
    .not()
    .isEmpty()
    .isLength({ min: 3 });

  const description = body(
    'description',
    'Description must not be empty and contain more than 10 and less than 200 characters'
  )
    .trim()
    .not()
    .isEmpty()
    .isLength({ min: 3, max: 200 });

  const image = body('image', 'Image must not be empty').trim().not().isEmpty();

  return [title, description, image];
};

const checkPlaceCreate = () => {
  const address = body('address', 'Address must not be empty').trim().not().isEmpty();

  const title = body('title', 'Title must not be empty and contain at least 3 characters')
    .trim()
    .not()
    .isEmpty()
    .isLength({ min: 3 });

  const description = body(
    'description',
    'Description must not be empty and contain more than 10 and less than 200 characters'
  )
    .trim()
    .not()
    .isEmpty()
    .isLength({ min: 3, max: 200 });

  const image = body('image', 'Image must not be empty').trim().not().isEmpty();

  return [address, title, description, image];
};

module.exports.checkUserSignup = checkUserSignup;
module.exports.checkUserUpdate = checkUserUpdate;
module.exports.checkPlaceUpdate = checkPlaceUpdate;
module.exports.checkPlaceCreate = checkPlaceCreate;
