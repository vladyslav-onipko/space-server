const fs = require('fs');

const {
  Types: { ObjectId },
} = require('mongoose');
const { validationResult } = require('express-validator');
const { hash, compare } = require('bcryptjs');
const { sign } = require('jsonwebtoken');

const HttpError = require('../models/http-error');
const { convertHoursToMilliseconds, checkImage, checkInputs } = require('../utils/helpers');

const User = require('../models/user');
const Rocket = require('../models/rocket');

const userSignup = async (req, res, next) => {
  const { name, email, password } = req.body;
  const errors = validationResult(req);

  checkInputs(errors, next);
  checkImage(req.file);

  try {
    const user = await User.findOne({ email: email });

    if (user) {
      throw new HttpError('User with provided email already exists, please login instead', 422, {
        file: 'email',
        message: 'Please use another email',
      });
    }

    const hashedPassword = await hash(password, 12);
    const createdUser = new User({
      name,
      email,
      image: req.file.path.replace(/\\/g, '/'),
      password: hashedPassword,
      rockets: [],
    });

    await createdUser.save();

    const token = sign({ email: createdUser.email, userId: createdUser.id }, process.env.JWT_KEY, {
      expiresIn: process.env.JWT_EXPIRATION,
    });

    res.status(201).json({
      message: `Hello ${createdUser.name}, now you are part of the space`,
      token: token,
      tokenExpiration: convertHoursToMilliseconds(process.env.JWT_EXPIRATION),
      user: {
        id: createdUser.id,
        name: createdUser.name,
        image: createdUser.image,
      },
    });
  } catch (e) {
    return next(new HttpError(e.message, e.code));
  }
};

const userSignin = async (req, res, next) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email: email });

    if (!user) {
      throw new HttpError('Couldn’t find a user with provided email', 401, {
        field: 'email',
        message: 'Please use your existing email',
      });
    }

    const isValidPassword = await compare(password, user.password);

    if (!isValidPassword) {
      throw new HttpError('Incorrect password', 401, {
        field: 'password',
        message: 'Please enter the correct password',
      });
    }

    const token = sign({ email: user.email, userId: user.id }, process.env.JWT_KEY, {
      expiresIn: process.env.JWT_EXPIRATION,
    });

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
  } catch (e) {
    return next(new HttpError(e.message, e.code, e.errors));
  }
};

const getUserProfile = async (req, res, next) => {
  const { id } = req.params;
  const { filter, search, page } = req.query;

  const currentPage = +page || 1;
  const elementsPerPage = 3;
  const elementsToSkip = (currentPage - 1) * elementsPerPage;

  const defaultFilterStagesMap = {
    all: { $match: { creator: new ObjectId(id) } },
    favorites: { $match: { creator: new ObjectId(id), likes: id } },
    shared: { $match: { creator: new ObjectId(id), shared: true } },
  };

  const filterStagesMap = { ...defaultFilterStagesMap };

  if (search) {
    filterStagesMap.all = { $match: { creator: new ObjectId(id), $text: { $search: search } } };
    filterStagesMap.favorites = { $match: { creator: new ObjectId(id), likes: id, $text: { $search: search } } };
    filterStagesMap.shared = { $match: { creator: new ObjectId(id), shared: true, $text: { $search: search } } };
  }

  const filterStage = filter ? filterStagesMap[filter] : filterStagesMap.all;
  const projectStage = {
    $project: {
      _id: 0,
      id: '$_id',
      title: 1,
      image: 1,
      shared: 1,
      description: 1,
      likes: 1,
      date: '$createdAt',
      creator: 1,
      rating: { $size: '$likes' },
    },
  };
  const sortStage = { $sort: { date: -1 } };
  const skipStage = { $skip: elementsToSkip };
  const limitStage = { $limit: elementsPerPage };

  const pipeline = [filterStage, projectStage, sortStage, skipStage, limitStage];

  try {
    const user = await User.findById(id);

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
    const [amount] = await Rocket.aggregate([defaultFilterStagesMap.all]).count('rockets');
    const [amountFavorites] = await Rocket.aggregate([defaultFilterStagesMap.favorites]).count('rockets');
    const [amountShared] = await Rocket.aggregate([defaultFilterStagesMap.shared]).count('rockets');
    const [currentAmount] = await Rocket.aggregate([filterStage]).count('rockets');

    const rockets = await Rocket.aggregate(pipeline);

    const totalPages = currentAmount?.rockets ? Math.ceil(currentAmount.rockets / elementsPerPage) : 1;
    const hasNextPage = currentPage < totalPages;

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
  } catch (e) {
    return next(new HttpError("Sorry, something went wrong. Can't load profile"));
  }
};

const userUpdateProfile = async (req, res, next) => {
  const { id } = req.params;
  const { name } = req.body;
  const errors = validationResult(req);

  checkInputs(errors, next);
  checkImage(req.file);

  let user;

  try {
    user = await User.findById(id);

    if (!user) {
      throw new HttpError('Sorry, something went wrong, please try again later', 500);
    }

    if (user.id.toString() !== req.user.id) {
      throw new HttpError('You are not allowed to edit this profile', 401);
    }
  } catch (e) {
    return next(new HttpError(e.message, e.code, e.errors));
  }

  try {
    fs.unlink(user.image, () => {}); // remove old image

    user.name = name;
    user.image = req.file.path.replace(/\\/g, '/');

    await user.save();

    res.status(201).json({
      message: 'Profile successfully updated',
      user: {
        id: user.id,
        name: user.name,
        image: user.image,
      },
    });
  } catch (e) {
    return next(new HttpError('Updating profile failed, please try again later'));
  }
};

module.exports.userSignup = userSignup;
module.exports.userSignin = userSignin;
module.exports.getUserProfile = getUserProfile;
module.exports.userUpdateProfile = userUpdateProfile;
