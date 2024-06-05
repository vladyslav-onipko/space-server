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
const Rocket = require('../models/rocket');

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
      rockets: [],
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

  const currentPage = +page || 1;
  const elementsPerPage = 3;
  const elementsToSkip = (currentPage - 1) * elementsPerPage;

  const defaultFilterStagesMap = {
    all: { $match: { creator: new ObjectId(userId) } },
    favorites: { $match: { creator: new ObjectId(userId), likes: userId } },
    shared: { $match: { creator: new ObjectId(userId), shared: true } },
  };

  const filterStagesMap = { ...defaultFilterStagesMap };

  if (search) {
    filterStagesMap.all = { $match: { creator: new ObjectId(userId), $text: { $search: search } } };
    filterStagesMap.favorites = {
      $match: { creator: new ObjectId(userId), likes: userId, $text: { $search: search } },
    };
    filterStagesMap.shared = { $match: { creator: new ObjectId(userId), shared: true, $text: { $search: search } } };
  }

  const filterStage = filter ? filterStagesMap[filter] : filterStagesMap.all;
  const projectStage = {
    $project: {
      _id: 0,
      id: '$_id',
      title: 1,
      image: 1,
      description: 1,
      likes: 1,
      createdAt: 1,
      rating: { $size: '$likes' },
    },
  };
  const sortStage = { $sort: { date: -1 } };
  const skipStage = { $skip: elementsToSkip };
  const limitStage = { $limit: elementsPerPage };

  const pipeline = [filterStage, projectStage, sortStage, skipStage, limitStage];

  let user, rockets, amount, amountFavorites, amountShared, currentAmount, totalPages, hasNextPage;

  try {
    user = await User.findById(userId);
  } catch (e) {
    return next(new HttpError('Sorry, something went wrong, could not load user profile'));
  }

  try {
    if (!user) {
      throw new HttpError('Could not find rockets for provided user', 404);
    }

    if (user.id.toString() !== req.user.id) {
      throw new HttpError('Not authorized', 401);
    }
  } catch (e) {
    return next(new HttpError(e.message, e.code, e.errors));
  }

  try {
    [amount] = await Rocket.aggregate([defaultFilterStagesMap.all]).count('rockets');
    [amountFavorites] = await Rocket.aggregate([defaultFilterStagesMap.favorites]).count('rockets');
    [amountShared] = await Rocket.aggregate([defaultFilterStagesMap.shared]).count('rockets');
    [currentAmount] = await Rocket.aggregate([filterStage]).count('rockets');

    rockets = await Rocket.aggregate(pipeline);

    totalPages = currentAmount?.rockets ? Math.ceil(currentAmount.rockets / elementsPerPage) : 1;
    hasNextPage = currentPage < totalPages;
  } catch (e) {
    return next(new HttpError('Sorry, something went wrong, could not load user profile'));
  }

  res.status(200).json({
    rockets,
    currentPage,
    totalPages,
    hasNextPage,
    amount: amount?.rockets || 0,
    amountFavorites: amountFavorites?.rockets || 0,
    amountShared: amountShared?.rockets || 0,
    currentAmount: currentAmount?.rockets || 0,
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

module.exports.userSignup = userSignup;
module.exports.userSignin = userSignin;
module.exports.getUserProfile = getUserProfile;
module.exports.userUpdateProfile = userUpdateProfile;
