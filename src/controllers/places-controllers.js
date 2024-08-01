const {
  startSession,
  Types: { ObjectId },
} = require('mongoose');
const { validationResult } = require('express-validator');

const { saveImage, validateInputs, getMapCoordinates } = require('../utils/helpers');
const HttpError = require('../models/http-error');
const User = require('../models/user');
const Place = require('../models/place');

const createPlace = async (req, res, next) => {
  const { address, title, description, creator, shared } = req.body;
  const errors = validationResult(req);
  const sharedValue = shared ? shared === 'true' : shared;

  validateInputs(errors, next);
  await saveImage(req.file, 'places', next);

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

  res.status(201).json({ message: 'Place successfully created' });
};

const editPlace = async (req, res, next) => {
  const { title, description } = req.body;
  const { id: placeId } = req.params;
  const { shared } = req.query;

  const sharedValue = shared ? shared === 'true' : shared;

  if (sharedValue === undefined) {
    const errors = validationResult(req);

    validateInputs(errors, next);
    await saveImage(req.file, 'places', next);
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
      place.title = title;
      place.description = description;
      place.image = req.file.path;
    }

    await place.save();
  } catch (e) {
    return next(new HttpError('Sorry, something went wrong, could not update place'));
  }

  res.status(201).json({ message: successMessage });
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

    topUserPlaces = await Place.aggregate([
      { $match: { creator: place.creator.id, shared: true } },
      {
        $project: {
          _id: 0,
          id: '$_id',
          title: 1,
          image: 1,
          likes: { $size: '$likes' },
        },
      },
      { $match: { likes: { $gt: 0 } } },
      { $sort: { likes: -1 } },
      { $limit: limitTopPlaces },
    ]);
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
  const { user: sessionUser, creator, page, search, filter, top: topPlaces } = req.query;

  const sessionUserId = sessionUser ? new ObjectId(sessionUser) : null;
  const creatorId = creator ? new ObjectId(creator) : null;

  if (topPlaces) {
    const limitTopPlaces = parseInt(topPlaces);
    let places;

    try {
      places = await Place.aggregate([
        { $match: { shared: true } },
        {
          $project: {
            _id: 0,
            id: '$_id',
            title: 1,
            image: 1,
            description: 1,
            favorite: { $in: [sessionUserId, '$likes'] },
            likes: { $size: '$likes' },
          },
        },
        { $match: { likes: { $gt: 0 } } },
        { $sort: { likes: -1 } },
        { $limit: limitTopPlaces },
      ]);
    } catch (e) {
      return next(new HttpError('Sorry, something went wrong, could not load places'));
    }

    res.status(200).json({ places });
  } else {
    const currentPage = parseInt(page) || 1;
    const elementsPerPage = 6;
    const elementsToSkip = (currentPage - 1) * elementsPerPage;

    const filterStagesMap = {
      all: { $match: { shared: true } },
      user: { $match: { shared: true, creator: creatorId } },
    };

    let places, placesAmount;

    if (search) {
      filterStagesMap.all = { $match: { shared: true, $text: { $search: search } } };
      filterStagesMap.user = { $match: { shared: true, creator: creatorId, $text: { $search: search } } };
    }

    const filterStage = filter ? filterStagesMap[filter] : filterStagesMap.all;
    const projectStage = {
      $project: {
        _id: 0,
        id: '$_id',
        title: 1,
        image: 1,
        description: 1,
        createdAt: 1,
        favorite: { $in: [sessionUserId, '$likes'] },
        likes: { $size: '$likes' },
      },
    };
    const sortStage = { $sort: { createdAt: -1 } };
    const skipStage = { $skip: elementsToSkip };
    const limitStage = { $limit: elementsPerPage };

    const pipeline = [filterStage, projectStage, sortStage, skipStage, limitStage];

    try {
      places = await Place.aggregate(pipeline);

      [placesAmount] = await Place.aggregate([filterStage]).count('places');
    } catch (e) {
      return next(new HttpError('Sorry, something went wrong, could not load places'));
    }

    const totalPages = placesAmount?.places ? Math.ceil(placesAmount.places / elementsPerPage) : 1;
    const hasNextPage = currentPage < totalPages;

    res.status(200).json({ places, placesAmount: placesAmount?.places, nextPage: currentPage + 1, hasNextPage });
  }
};

const likePlace = async (req, res, next) => {
  const { id: placeId } = req.params;
  const { userId } = req.query;

  const userObjectId = userId ? new ObjectId(userId) : null;
  const placeObjectId = placeId ? new ObjectId(placeId) : null;

  let user, place;

  try {
    user = await User.findById(userId);
  } catch (e) {
    return next(new HttpError('Sorry, something went wrong, could not like the place'));
  }

  try {
    if (!user) {
      throw new HttpError('Sorry, could not find a user with provided id', 404);
    }
  } catch (e) {
    return next(new HttpError(e.message, e.code));
  }

  try {
    place = await Place.findById(placeId);
  } catch (e) {
    return next(new HttpError('Sorry, something went wrong, could not like the place'));
  }

  try {
    if (!place) {
      throw new HttpError('Sorry, could not found place with provided id');
    }
  } catch (e) {
    return next(new HttpError(e.message));
  }

  try {
    const [updatedPlace] = await Place.aggregate([
      { $match: { _id: placeObjectId } },
      {
        $addFields: {
          likes: {
            $cond: {
              if: { $in: [userObjectId, '$likes'] },
              then: { $filter: { input: '$likes', as: 'userId', cond: { $ne: ['$$userId', userObjectId] } } },
              else: {
                $concatArrays: ['$likes', [userObjectId]],
              },
            },
          },
        },
      },
    ]);

    await Place.bulkWrite([
      {
        updateOne: {
          filter: { _id: updatedPlace._id },
          update: { likes: updatedPlace.likes },
        },
      },
    ]);
  } catch (e) {
    return next(new HttpError('Sorry, something went wrong, could not like the place'));
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
      throw new HttpError('Could not find a place with provided id', 404);
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
  } catch (e) {
    return next(new HttpError('Sorry, something went wrong, could not delete the place'));
  }

  res.status(200).json({ message: 'Place successfully deleted' });
};

module.exports.createPlace = createPlace;
module.exports.editPlace = editPlace;
module.exports.getPlace = getPlace;
module.exports.getPlaces = getPlaces;
module.exports.deletePlace = deletePlace;
module.exports.likePlace = likePlace;
