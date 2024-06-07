const { Router } = require('express');

const { createPlace, getPlace, editPlace, deletePlace, likePlace } = require('../controllers/places-controllers');
const checkAuth = require('../middleware/check-auth');
const { checkPlaceUpdate, checkPlaceCreate } = require('../middleware/input-validation');
const { imageUpload } = require('../middleware/image-upload');

const router = Router();

// Get place route
router.get('/:id', getPlace);

// Edit place route
router.patch('/:id', checkAuth, imageUpload('places'), checkPlaceUpdate(), editPlace);

// Delete place route
router.delete('/:id', checkAuth, deletePlace);

// Like place route
router.patch('/:id/favorite', likePlace);

// Create new place route
router.post('/', checkAuth, imageUpload('places'), checkPlaceCreate(), createPlace);

module.exports = router;
