const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const uploadImageToCloudinary = async (image, folder) => {
  // create array buffer from request file buffer
  const imageData = await Promise.resolve(
    image.buffer.buffer.slice(image.buffer.byteOffset, image.buffer.byteOffset + image.buffer.byteLength)
  );
  const mime = image.mimetype;
  const encoding = 'base64';
  const base64Data = Buffer.from(imageData).toString('base64');
  const fileUri = 'data:' + mime + ';' + encoding + ',' + base64Data;
  const result = await cloudinary.uploader.upload(fileUri, {
    folder: `space-server/${folder}`,
  });
  return result.secure_url;
};

module.exports.uploadImageToCloudinary = uploadImageToCloudinary;
