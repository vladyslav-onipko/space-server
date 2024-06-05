const { Schema, model } = require('mongoose');

const rocketSchema = new Schema(
  {
    address: {
      type: String,
      require: true,
    },
    location: {
      lat: { type: Number, require: true },
      lng: { type: Number, require: true },
    },
    title: {
      type: String,
      require: true,
    },
    image: {
      type: String,
      require: true,
    },
    description: {
      type: String,
      maxlengrh: 200,
      require: true,
    },
    shared: {
      type: Boolean,
    },
    likes: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    creator: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      require: true,
    },
  },
  {
    timestamps: true,
  }
);

rocketSchema.index({ title: 'text' });

module.exports = model('Rocket', rocketSchema);
