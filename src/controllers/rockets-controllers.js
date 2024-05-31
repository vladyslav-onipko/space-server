const fs = require('fs');

const { startSession } = require('mongoose');
const { validationResult } = require('express-validator');

const { checkImage, checkInputs } = require('../utils/helpers');

const HttpError = require('../models/http-error');
const User = require('../models/user');
const Rocket = require('../models/rocket');

const createRocket = async (req, res, next) => {
  const { title, description, creator, shared } = req.body;
  const errors = validationResult(req);

  checkInputs(errors, next);
  checkImage(req.file, next);

  let user;

  try {
    user = await User.findById(creator);

    if (!user) {
      throw new HttpError('Could not find a user with provided id', 404);
    }

    if (user.id.toString() !== req.user.id) {
      throw new HttpError('You are not allowed to create rocket', 401);
    }
  } catch (e) {
    return next(new HttpError(e.message, e.code, e.errors));
  }

  const rocket = new Rocket({
    title,
    description,
    image: req.file.path.replace(/\\/g, '/'),
    creator,
    likes: [],
    shared: shared === 'true',
  });

  try {
    const session = await startSession();

    session.startTransaction();
    await rocket.save({ session });
    user.rockets.push(rocket);
    await user.save({ session });
    await session.commitTransaction();

    res.status(201).json({
      message: 'Rocket successfully created',
      rocket: {
        id: rocket.id,
        title: rocket.title,
        description: rocket.description,
        likes: rocket.likes,
        rating: rocket.likes.lenght,
        image: rocket.image,
        date: rocket.createdAt,
        shared: rocket.shared,
        creator: rocket.creator,
      },
    });
  } catch (e) {
    return next(new HttpError('Creating rocket failed, please try again later'));
  }
};

const editRocket = async (req, res, next) => {
  const { title, description, creator } = req.body;
  const { id: rocketId } = req.params;
  const { shared } = req.query;

  if (!shared) {
    const errors = validationResult(req);

    checkInputs(errors, next);
    checkImage(req.file, next);
  }

  let rocket;

  try {
    const user = await User.findById(creator);

    if (!user) {
      throw new HttpError('Could not find a user with provided id', 404);
    }

    if (user.id.toString() !== req.user.id) {
      throw new HttpError('You are not allowed to edit rocket', 401);
    }
  } catch (e) {
    return next(new HttpError(e.message, e.code, e.errors));
  }

  try {
    rocket = await Rocket.findById(rocketId);

    if (!rocket) {
      throw new HttpError('Could not find a rocket with provided id', 404);
    }
  } catch (e) {
    return next(new HttpError(e.message, e.code, e.errors));
  }

  try {
    if (shared) {
      rocket.shared = shared === 'true';
    } else {
      fs.unlink(rocket.image, () => {}); // remove old image

      rocket.title = title;
      rocket.description = description;
      rocket.image = req.file.path.replace(/\\/g, '/');
    }

    await rocket.save();

    res.status(201).json({
      message: 'Rocket successfully updated',
      rocket: {
        id: rocket.id,
        title: rocket.title,
        description: rocket.description,
        likes: rocket.likes,
        rating: rocket.likes.length,
        image: rocket.image,
        date: rocket.createdAt,
        shared: rocket.shared,
        creator: rocket.creator,
      },
    });
  } catch (e) {
    return next(new HttpError(e.message, 500));
  }
};

const getRocket = async (req, res, next) => {
  const { id } = req.params;

  try {
    const rocket = await Rocket.findById(id);

    if (!rocket) {
      throw new HttpError('Could not find a rocket with provided id', 404);
    }

    res.status(200).json({
      rocket: {
        id: rocket.id,
        title: rocket.title,
        description: rocket.description,
        likes: rocket.likes,
        image: rocket.image,
        rating: rocket.likes.length,
        date: rocket.createdAt,
        shared: rocket.shared,
        creator: rocket.creator,
      },
    });
  } catch (e) {
    return next(new HttpError(e.message, e.code, e.errors));
  }
};

module.exports.createRocket = createRocket;
module.exports.editRocket = editRocket;
module.exports.getRocket = getRocket;
