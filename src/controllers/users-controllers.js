const fs = require('fs');

const {
  Types: { ObjectId },
} = require('mongoose');
const { validationResult } = require('express-validator');
const { hash, compare } = require('bcryptjs');
const { sign } = require('jsonwebtoken');

const HttpError = require('../models/http-error');
const { convertHoursToMilliseconds, validateImageFile, validateInputs } = require('../utils/helpers');

const User = require('../models/user');
const Place = require('../models/place');

const userSignup = async (req, res, next) => {
  const { name, email, password } = req.body;
  const errors = validationResult(req);

  validateInputs(errors, next);
  validateImageFile(req.file);

  let user, createdUser, token;

  try {
    user = await User.findOne({ email: email });
  } catch (e) {
    return next(new HttpError('Sorry, something went wrong, could not sign up'));
  }

  try {
    if (user) {
      throw new HttpError('User with provided email already exists, please login instead', 422, {
        field: 'email',
        message: 'Please use another email',
      });
    }
  } catch (e) {
    return next(new HttpError(e.message, e.code, e.errors));
  }

  try {
    const hashedPassword = await hash(password, 12);
    createdUser = new User({
      name,
      email,
      image: req.file.path,
      password: hashedPassword,
      places: [],
    });

    await createdUser.save();
  } catch (e) {
    return next(new HttpError('Sorry, something went wrong, could not sign up'));
  }

  try {
    token = sign({ email: createdUser.email, userId: createdUser.id }, process.env.JWT_KEY, {
      expiresIn: process.env.JWT_EXPIRATION,
    });
  } catch (e) {
    return next(new HttpError('Sorry, something went wrong, could not sign up'));
  }

  res.status(201).json({
    message: `Hello ${createdUser.name}, now you are part of the space`,
    token,
    tokenExpiration: convertHoursToMilliseconds(process.env.JWT_EXPIRATION),
    user: {
      id: createdUser.id,
      name: createdUser.name,
      image: createdUser.image,
    },
  });
};

const userSignin = async (req, res, next) => {
  const { email, password } = req.body;

  let user, token;

  try {
    user = await User.findOne({ email: email });
  } catch (e) {
    return next(new HttpError('Sorry, something went wrong, could not sign in'));
  }

  try {
    if (!user) {
      throw new HttpError('Could not find a user with provided email', 401, {
        field: 'email',
        message: 'Please use existing email',
      });
    }

    const isValidPassword = await compare(password, user.password);

    if (!isValidPassword) {
      throw new HttpError('Incorrect password', 401, {
        field: 'password',
        message: 'Please enter the correct password',
      });
    }
  } catch (e) {
    return next(new HttpError(e.message, e.code, e.errors));
  }

  try {
    token = sign({ email: user.email, userId: user.id }, process.env.JWT_KEY, {
      expiresIn: process.env.JWT_EXPIRATION,
    });
  } catch (e) {
    return next(new HttpError('Sorry, something went wrong, could not sign in'));
  }

  res.status(200).json({
    message: `Hello ${user.name}, glad to see you again`,
    token: token,
    tokenExpiration: convertHoursToMilliseconds(process.env.JWT_EXPIRATION),
    user: {
      id: user.id,
      name: user.name,
      image: user.image,
    },
  });
};

const getUserProfile = async (req, res, next) => {
  const { id: userId } = req.params;
  const { filter, search, page } = req.query;

  const currentPage = parseInt(page) || 1;
  const elementsPerPage = 3;
  const elementsToSkip = (currentPage - 1) * elementsPerPage;

  const userObjectId = new ObjectId(userId);

  const defaultFilterStagesMap = {
    all: { $match: { creator: userObjectId } },
    favorites: { $match: { creator: userObjectId, likes: userObjectId } },
    shared: { $match: { creator: userObjectId, shared: true } },
  };

  const filterStagesMap = { ...defaultFilterStagesMap };

  if (search) {
    filterStagesMap.all = { $match: { creator: userObjectId, $text: { $search: search } } };
    filterStagesMap.favorites = { $match: { creator: userObjectId, likes: userObjectId, $text: { $search: search } } };
    filterStagesMap.shared = { $match: { creator: userObjectId, shared: true, $text: { $search: search } } };
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
      favorite: { $in: [userObjectId, '$likes'] },
      likes: { $size: '$likes' },
    },
  };
  const sortStage = { $sort: { createdAt: -1 } };
  const skipStage = { $skip: elementsToSkip };
  const limitStage = { $limit: elementsPerPage };

  const pipeline = [filterStage, projectStage, sortStage, skipStage, limitStage];

  let user, places, placesAmount, favoritesAmount, sharedAmount, currentPlacesAmount;

  try {
    user = await User.findById(userId);
  } catch (e) {
    return next(new HttpError('Sorry, something went wrong, could not load user profile'));
  }

  try {
    if (!user) {
      throw new HttpError('Could not find places for provided user', 404);
    }

    if (user.id.toString() !== req.user.id) {
      throw new HttpError('Not authorized', 401);
    }
  } catch (e) {
    return next(new HttpError(e.message, e.code, e.errors));
  }

  try {
    [placesAmount] = await Place.aggregate([defaultFilterStagesMap.all]).count('places');
    [favoritesAmount] = await Place.aggregate([defaultFilterStagesMap.favorites]).count('places');
    [sharedAmount] = await Place.aggregate([defaultFilterStagesMap.shared]).count('places');
    [currentPlacesAmount] = await Place.aggregate([filterStage]).count('places');

    places = await Place.aggregate(pipeline);
  } catch (e) {
    return next(new HttpError('Sorry, something went wrong, could not load user profile'));
  }

  const totalPages = currentPlacesAmount?.places ? Math.ceil(currentPlacesAmount.places / elementsPerPage) : 1;
  const hasNextPage = currentPage < totalPages;

  res.status(200).json({
    places,
    currentPage,
    totalPages,
    hasNextPage,
    placesAmount: placesAmount?.places || 0,
    favoritesAmount: favoritesAmount?.places || 0,
    sharedAmount: sharedAmount?.places || 0,
    currentPlacesAmount: currentPlacesAmount?.places || 0,
  });
};

const userUpdateProfile = async (req, res, next) => {
  const { name } = req.body;
  const { id: userId } = req.params;
  const errors = validationResult(req);

  validateInputs(errors, next);
  validateImageFile(req.file);

  let user;

  try {
    user = await User.findById(userId);
  } catch (e) {
    return next(new HttpError('Something went wrong, could not update user profile'));
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
    fs.unlink(user.image, () => {}); // remove old image

    user.name = name;
    user.image = req.file.path;

    await user.save();
  } catch (e) {
    return next(new HttpError('Something went wrong, could not update user profile'));
  }

  res.status(201).json({
    message: 'Profile successfully updated',
    user: {
      id: user.id,
      name: user.name,
      image: user.image,
    },
  });
};

const getUsers = async (req, res, next) => {
  const { max } = req.query;

  const limitUsers = max ? parseInt(max) : Number.MAX_SAFE_INTEGER;
  let users;

  try {
    users = await User.aggregate([
      { $lookup: { from: 'places', localField: 'places', foreignField: '_id', as: 'place' } },
      { $unwind: '$place' },
      {
        $group: {
          _id: { id: '$_id', name: '$name', image: '$image' },
          totalLikes: { $sum: { $size: '$place.likes' } },
          totalPlaces: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          id: '$_id.id',
          name: '$_id.name',
          image: '$_id.image',
          rating: { $round: [{ $divide: ['$totalLikes', '$totalPlaces'] }, 1] },
        },
      },
      { $match: { rating: { $gt: 0 } } },
      { $sort: { rating: -1 } },
      { $limit: limitUsers },
    ]);
  } catch (e) {
    return next(new HttpError('Something went wrong, could not load users'));
  }

  res.status(200).json({ users });
};

module.exports.userSignup = userSignup;
module.exports.userSignin = userSignin;
module.exports.getUserProfile = getUserProfile;
module.exports.userUpdateProfile = userUpdateProfile;
module.exports.getUsers = getUsers;
