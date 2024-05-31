const multer = require('multer');
const { v4: uuidV4 } = require('uuid');

const MIME_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/jpg': 'jpg',
};

const imageUpload = (folder) => {
  const imageDestination = (_, _2, callback) => {
    callback(null, `src/uploads/images/${folder}`);
  };

  const imageFilename = (_, file, callback) => {
    const fileExt = MIME_TYPES[file.mimetype];
    const fileName = uuidV4() + '.' + fileExt;

    callback(null, fileName);
  };

  const imageFileFilter = (_, file, callback) => {
    const isValid = !!MIME_TYPES[file.mimetype];
    const error = isValid ? null : new Error('Invalid mime type');

    callback(error, isValid);
  };

  const fileUpload = multer({
    limits: 500000,
    storage: multer.diskStorage({
      destination: imageDestination,
      filename: imageFilename,
    }),
    fileFilter: imageFileFilter,
  });

  return fileUpload.single('image');
};

module.exports.imageUpload = imageUpload;
