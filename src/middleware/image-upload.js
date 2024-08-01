const multer = require('multer');

const MIME_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/jpg': 'jpg',
};

const imageUpload = () => {
  const imageFileFilter = (_, file, callback) => {
    const isValid = !!MIME_TYPES[file.mimetype];
    const error = isValid ? null : new Error('Invalid mime type');

    callback(error, isValid);
  };

  const fileUpload = multer({
    limits: 500000,
    storage: multer.memoryStorage(),
    fileFilter: imageFileFilter,
  });

  return fileUpload.single('image');
};

module.exports.imageUpload = imageUpload;
