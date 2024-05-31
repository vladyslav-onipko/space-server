const { Router } = require('express');

const { createRocket, getRocket, editRocket } = require('../controllers/rockets-controllers');
const checkAuth = require('../middleware/check-auth');
const { checkRocket } = require('../middleware/input-validation');
const { imageUpload } = require('../middleware/image-upload');

const router = Router();

// Get rocket route
router.get('/:id', getRocket);

// Edit rocket route
router.patch('/:id', checkAuth, imageUpload('rockets'), checkRocket(), editRocket);

// Create new rocket route
router.post('/', checkAuth, imageUpload('rockets'), checkRocket(), createRocket);

module.exports = router;
