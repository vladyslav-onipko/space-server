const { Router } = require('express');

const { userSignup, userSignin, getUserProfile, userUpdateProfile } = require('../controllers/users-controllers');
const { checkUserSignup, checkUserUpdate } = require('../middleware/input-validation');
const { imageUpload } = require('../middleware/image-upload');
const checkAuth = require('../middleware/check-auth');

const router = Router();

// User update profile route
router.patch('/:id', checkAuth, imageUpload('users'), checkUserUpdate(), userUpdateProfile);

// User get profile route
router.get('/:id', checkAuth, getUserProfile);

// User signup router
router.post('/signup', imageUpload('users'), checkUserSignup(), userSignup);

// User login router
router.post('/signin', userSignin);

module.exports = router;
