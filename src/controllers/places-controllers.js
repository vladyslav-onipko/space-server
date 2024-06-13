const fs = require('fs');

const {
  startSession,
  Types: { ObjectId },
} = require('mongoose');
const { validationResult } = require('express-validator');

const { validateImageFile, validateInputs, getMapCoordinates } = require('../utils/helpers');
const HttpError = require('../models/http-error');
const User = require('../models/user');
const Place = require('../models/place');

const createPlace = async (req, res, next) => {
  const { address, title, description, creator, shared } = req.body;
  const errors = validationResult(req);

  const sharedValue = shared ? shared === 'true' : shared;

  validateInputs(errors, next);
  validateImageFile(req.file, next);

  let user, coordinates;

  try {
    user = await User.findById(creator);
  } catch (e) {
    return next(new HttpError('Sorry, something went wrong, could not create place'));
  }

  try {
    if (!user) {
      throw new HttpError('Could not find a user with provided id', 404);
    }

    if (user.id.toString() !== req.user.id) {
      throw new HttpError('Not authorized', 401);
    }
  } catch (e) {
    return next(new HttpError(e.message, e.code, e.errors));
  }

  try {
    coordinates = await getMapCoordinates(address);
  } catch (e) {
    return next(new HttpError(e.message, 422, { field: 'address', message: 'Enter the correct address' }));
  }

  const place = new Place({
    address,
    location: coordinates,
    title,
    description,
    image: req.file.path,
    creator,
    likes: [],
    shared: sharedValue,
  });

  try {
    const session = await startSession();

    session.startTransaction();
    await place.save({ session });
    user.places.push(place);
    await user.save({ session });
    await session.commitTransaction();
  } catch (e) {
    return next(new HttpError('Sorry, something went wrong, could not create place'));
  }

  res.status(201).json({
    message: 'Place successfully created',
    place: {
      ...place._doc,
      id: place.id,
      likes: place.likes.length,
    },
  });
};

const editPlace = async (req, res, next) => {
  const { title, description } = req.body;
  const { id: placeId } = req.params;
  const { shared } = req.query;

  const sharedValue = shared ? shared === 'true' : shared;

  if (sharedValue === undefined) {
    const errors = validationResult(req);

    validateInputs(errors, next);
    validateImageFile(req.file, next);
  }

  let place, user;
  let successMessage = 'Place successfully updated';

  try {
    place = await Place.findById(placeId);
  } catch (e) {
    return next(new HttpError('Sorry, something went wrong, could not update place'));
  }

  try {
    if (!place) {
      throw new HttpError('Could not find a place with provided id', 404);
    }
  } catch (e) {
    return next(new HttpError(e.message, e.code, e.errors));
  }

  try {
    user = await User.findById(place.creator);
  } catch (e) {
    return next(new HttpError('Sorry, something went wrong, could not update place'));
  }

  try {
    if (!user) {
      throw new HttpError('Could not find a user created the place', 404);
    }

    if (user.id.toString() !== req.user.id) {
      throw new HttpError('Not authorized', 401);
    }
  } catch (e) {
    return next(new HttpError(e.message, e.code, e.errors));
  }

  try {
    if (sharedValue !== undefined) {
      place.shared = sharedValue;
      successMessage = sharedValue
        ? 'You have successfully share the place'
        : 'You have successfully unshare the place';
    } else {
      fs.unlink(place.image, () => {}); // remove old image

      place.title = title;
      place.description = description;
      place.image = req.file.path;
    }

    await place.save();
  } catch (e) {
    return next(new HttpError('Sorry, something went wrong, could not update place'));
  }

  res.status(201).json({
    message: successMessage,
    place: {
      ...place._doc,
      id: place.id,
      likes: place.likes.length,
    },
  });
};

const getPlace = async (req, res, next) => {
  const { id } = req.params;

  let place, topUserPlaces, userScoreData;
  const limitTopPlaces = 3;

  try {
    [place] = await Place.aggregate([
      { $match: { _id: new ObjectId(id) } },
      { $lookup: { from: 'users', localField: 'creator', foreignField: '_id', as: 'creator' } },
      { $unwind: '$creator' },
      {
        $project: {
          _id: 0,
          id: '$_id',
          address: 1,
          location: 1,
          title: 1,
          image: 1,
          description: 1,
          shared: 1,
          createdAt: 1,
          likes: { $size: '$likes' },
          creator: {
            id: '$creator._id',
            name: '$creator.name',
            image: '$creator.image',
          },
        },
      },
    ]);
  } catch (e) {
    return next(new HttpError('Sorry, something went wrong, could not load place'));
  }

  try {
    if (!place) {
      throw new HttpError('Could not find a place with provided id', 404);
    }
  } catch (e) {
    return next(new HttpError(e.message, e.code, e.errors));
  }

  try {
    [userScoreData] = await Place.aggregate([
      { $match: { creator: place.creator.id } },
      { $group: { _id: null, totalLikes: { $sum: { $size: '$likes' } }, totalPlaces: { $sum: 1 } } },
      { $project: { _id: 0, totalPlaces: 1, rating: { $round: [{ $divide: ['$totalLikes', '$totalPlaces'] }, 1] } } },
    ]);

    topUserPlaces = await Place.find(
      { creator: place.creator.id, shared: true },
      { _id: 0, id: '$_id', title: 1, image: 1 }
    )
      .sort({ likes: -1 })
      .limit(limitTopPlaces);
  } catch (e) {
    return next(new HttpError('Sorry, something went wrong, could not load place'));
  }

  res.status(200).json({
    place,
    topUserPlaces,
    userPlacesAmount: userScoreData.totalPlaces,
    userRating: userScoreData.rating,
  });
};

const getPlaces = async (req, res, next) => {
  const { user: userId, page, search } = req.query;

  const currentPage = parseInt(page) || 1;
  const elementsPerPage = 1;
  const elementsToSkip = (currentPage - 1) * elementsPerPage;

  const userObjectId = userId ? new ObjectId(userId) : null;

  let places, totalPlaces;

  const piplineStages = {
    match: { $match: { shared: true } },
    project: {
      $project: {
        _id: 0,
        id: '$_id',
        title: 1,
        image: 1,
        description: 1,
        createdAt: 1,
        favorite: { $in: [userObjectId, '$likes'] },
        likes: { $size: '$likes' },
      },
    },
    sort: { $sort: { createdAt: -1 } },
    skip: { $skip: elementsToSkip },
    limit: { $limit: elementsPerPage },
  };

  if (search) {
    piplineStages.match = { $match: { shared: true, $text: { $search: search } } };
  }

  try {
    places = await Place.aggregate([
      piplineStages.match,
      piplineStages.project,
      piplineStages.sort,
      piplineStages.skip,
      piplineStages.limit,
    ]);

    totalPlaces = await Place.find({ shared: true }).countDocuments();
  } catch (e) {
    return next(new HttpError('Sorry, something went wrong, could not load places'));
  }

  const totalPages = totalPlaces ? Math.ceil(totalPlaces / elementsPerPage) : 1;
  const hasNextPage = currentPage < totalPages;

  res.status(200).json({ places, totalPlaces, nextPage: currentPage + 1, hasNextPage });
};

const likePlace = async (req, res, next) => {
  const { id: placeId } = req.params;
  const { like, userId } = req.query;

  const likeValue = like ? like === 'true' : like;

  let user, place;

  try {
    user = await User.findById(userId);
  } catch (e) {
    return next(new HttpError('Sorry, something went wrong, could not like place'));
  }

  try {
    if (!user) {
      throw new HttpError('Sorry, user is not registered');
    }
  } catch (e) {
    return next(new HttpError(e.message));
  }

  try {
    place = await Place.findById(placeId);
  } catch (e) {
    return next(new HttpError('Sorry, something went wrong, could not like place'));
  }

  try {
    if (!place) {
      throw new HttpError('Sorry, could not found place with provided id');
    }
  } catch (e) {
    return next(new HttpError(e.message));
  }

  try {
    if (likeValue) {
      place.likes.push(user);
    } else {
      place.likes.pull(user);
    }
    await place.save();
  } catch (e) {
    return next(new HttpError('Sorry, something went wrong, could not like place'));
  }

  res.status(201).json({ message: 'Place successfully updated' });
};

const deletePlace = async (req, res, next) => {
  const { id: placeId } = req.params;

  let place, user;

  try {
    place = await Place.findById(placeId);
  } catch (e) {
    return next(new HttpError('Sorry, something went wrong, could not delete the place'));
  }

  try {
    if (!place) {
      throw new HttpError('Could not find a user created the place', 404);
    }
  } catch (e) {
    return next(new HttpError(e.message, e.code));
  }

  try {
    user = await User.findById(place.creator);
  } catch (e) {
    return next(new HttpError('Sorry, something went wrong, could not delete the place'));
  }

  try {
    if (!user) {
      throw new HttpError('Could not find a user created the place', 404);
    }

    if (user.id.toString() !== req.user.id) {
      throw new HttpError('Not authorized', 401);
    }
  } catch (e) {
    return next(new HttpError(e.message, e.code));
  }

  try {
    const session = await startSession();

    session.startTransaction();
    await place.deleteOne({ session });
    user.places.pull(place);
    await user.save({ session });
    await session.commitTransaction();
    fs.unlink(place.image, () => {});
  } catch (e) {
    return next(new HttpError('Sorry, something went wrong, could not delete the place'));
  }

  res.status(200).json({
    message: 'Place successfully deleted',
  });
};

module.exports.createPlace = createPlace;
module.exports.editPlace = editPlace;
module.exports.getPlace = getPlace;
module.exports.getPlaces = getPlaces;
module.exports.deletePlace = deletePlace;
module.exports.likePlace = likePlace;
