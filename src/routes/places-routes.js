const { Router } = require('express');

const {
  createPlace,
  getPlace,
  getPlaces,
  editPlace,
  deletePlace,
  likePlace,
} = require('../controllers/places-controllers');
const checkAuth = require('../middleware/check-auth');
const { checkPlaceUpdate, checkPlaceCreate } = require('../middleware/input-validation');

const router = Router();

// Get all users places route
router.get('/', getPlaces);

// Get place route
router.get('/:id', getPlace);

// Edit place route
router.patch('/:id', checkAuth, checkPlaceUpdate(), editPlace);

// Delete place route
router.delete('/:id', checkAuth, deletePlace);

// Like place route
router.patch('/:id/favorite', likePlace);

// Create new place route
router.post('/', checkAuth, checkPlaceCreate(), createPlace);

module.exports = router;
