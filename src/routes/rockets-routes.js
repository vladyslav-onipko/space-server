const { Router } = require('express');

const { createRocket, getRocket, editRocket, deleteRocket } = require('../controllers/rockets-controllers');
const checkAuth = require('../middleware/check-auth');
const { checkRocketUpdate, checkRocketCreate } = require('../middleware/input-validation');
const { imageUpload } = require('../middleware/image-upload');

const router = Router();

// Get rocket route
router.get('/:id', getRocket);

// Edit rocket route
router.patch('/:id', checkAuth, imageUpload('rockets'), checkRocketUpdate(), editRocket);

// Delete rocket route
router.delete('/:id', checkAuth, deleteRocket);

// Create new rocket route
router.post('/', checkAuth, imageUpload('rockets'), checkRocketCreate(), createRocket);

module.exports = router;
