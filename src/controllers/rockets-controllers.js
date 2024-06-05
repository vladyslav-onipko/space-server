const fs = require('fs');

const { startSession } = require('mongoose');
const { validationResult } = require('express-validator');

const { validateImageFile, validateInputs, getMapCoordinates } = require('../utils/helpers');
const HttpError = require('../models/http-error');
const User = require('../models/user');
const Rocket = require('../models/rocket');

const createRocket = async (req, res, next) => {
  const { address, title, description, creator, shared } = req.body;
  const errors = validationResult(req);

  const sharedValue = shared ? shared === 'true' : shared;

  validateInputs(errors, next);
  validateImageFile(req.file, next);

  let user, coordinates;

  try {
    user = await User.findById(creator);
  } catch (e) {
    return next(new HttpError('Sorry, something went wrong, could not create rocket'));
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
    return next(new HttpError(e.message, e.code, e.errors));
  }

  const rocket = new Rocket({
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
    await rocket.save({ session });
    user.rockets.push(rocket);
    await user.save({ session });
    await session.commitTransaction();
  } catch (e) {
    return next(new HttpError('Sorry, something went wrong, could not create rocket'));
  }

  res.status(201).json({
    message: 'Rocket successfully created',
    rocket: {
      ...rocket._doc,
      id: rocket.id,
      rating: rocket.likes.length,
    },
  });
};

const editRocket = async (req, res, next) => {
  const { title, description } = req.body;
  const { id: rocketId } = req.params;
  const { shared } = req.query;

  const sharedValue = shared ? shared === 'true' : shared;

  if (sharedValue === undefined) {
    const errors = validationResult(req);

    validateInputs(errors, next);
    validateImageFile(req.file, next);
  }

  let rocket, user;
  let successMessage = 'Rocket successfully updated';

  try {
    rocket = await Rocket.findById(rocketId);
  } catch (e) {
    return next(new HttpError('Sorry, something went wrong, could not update rocket'));
  }

  try {
    if (!rocket) {
      throw new HttpError('Could not find a rocket with provided id', 404);
    }
  } catch (e) {
    return next(new HttpError(e.message, e.code, e.errors));
  }

  try {
    user = await User.findById(rocket.creator);
  } catch (e) {
    return next(new HttpError('Sorry, something went wrong, could not update rocket'));
  }

  try {
    if (!user) {
      throw new HttpError('Could not find a user created the rocket', 404);
    }

    if (user.id.toString() !== req.user.id) {
      throw new HttpError('Not authorized', 401);
    }
  } catch (e) {
    return next(new HttpError(e.message, e.code, e.errors));
  }

  try {
    if (sharedValue !== undefined) {
      rocket.shared = sharedValue;
      successMessage = sharedValue
        ? 'You have successfully share the rocket'
        : 'You have successfully unshare the rocket';
    } else {
      fs.unlink(rocket.image, () => {}); // remove old image

      rocket.title = title;
      rocket.description = description;
      rocket.image = req.file.path;
    }

    await rocket.save();
  } catch (e) {
    return next(new HttpError('Sorry, something went wrong, could not update rocket'));
  }

  res.status(201).json({
    message: successMessage,
    rocket: {
      ...rocket._doc,
      id: rocket.id,
      rating: rocket.likes.length,
    },
  });
};

const getRocket = async (req, res, next) => {
  const { id } = req.params;

  let rocket;

  try {
    rocket = await Rocket.findById(id);
  } catch (e) {
    return next(new HttpError('Sorry, something went wrong, could not load rocket'));
  }

  try {
    if (!rocket) {
      throw new HttpError('Could not find a rocket with provided id', 404);
    }
  } catch (e) {
    return next(new HttpError(e.message, e.code, e.errors));
  }

  res.status(200).json({
    rocket: {
      ...rocket._doc,
      id: rocket.id,
      rating: rocket.likes.length,
    },
  });
};

const deleteRocket = async (req, res, next) => {
  const { id: rocketId } = req.params;

  let rocket, user;

  try {
    rocket = await Rocket.findById(rocketId);
  } catch (e) {
    return next(new HttpError('Sorry, something went wrong, could not delete the rocket'));
  }

  try {
    if (!rocket) {
      throw new HttpError('Could not find a user created the rocket', 404);
    }
  } catch (e) {
    return next(new HttpError(e.message, e.code));
  }

  try {
    user = await User.findById(rocket.creator);
  } catch (e) {
    return next(new HttpError('Sorry, something went wrong, could not delete the rocket'));
  }

  try {
    if (!user) {
      throw new HttpError('Could not find a user created the rocket', 404);
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
    await rocket.deleteOne({ session });
    user.rockets.pull(rocket);
    await user.save({ session });
    await session.commitTransaction();
  } catch (e) {
    return next(new HttpError('Sorry, something went wrong, could not delete the rocket'));
  }

  res.status(200).json({
    message: 'Rocket successfully deleted',
  });
};

module.exports.createRocket = createRocket;
module.exports.editRocket = editRocket;
module.exports.getRocket = getRocket;
module.exports.deleteRocket = deleteRocket;
