const { Schema, model } = require('mongoose');
const uniqueValidator = require('mongoose-unique-validator');

const userSchema = new Schema({
  name: {
    type: String,
    require: true,
  },
  email: {
    type: String,
    require: true,
    unique: true,
  },
  image: {
    type: String,
    require: true,
  },
  password: {
    type: String,
    require: true,
    minlength: 6,
  },
  places: [
    {
      type: Schema.Types.ObjectId,
      ref: 'Place',
    },
  ],
});

userSchema.plugin(uniqueValidator);

module.exports = model('User', userSchema);
