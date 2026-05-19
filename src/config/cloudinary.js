import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const FOLDER = process.env.CLOUDINARY_FOLDER || 'sistema-choferes';

// Multer en memoria; las imágenes se suben luego a Cloudinary
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB por archivo
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Solo se permiten imágenes'));
  },
});

/**
 * Sube un buffer a Cloudinary y devuelve { url, public_id }.
 * @param {Buffer} buffer
 * @param {string} subfolder Ej: 'checks/2026-05'
 */
export function uploadBuffer(buffer, subfolder = '') {
  return new Promise((resolve, reject) => {
    const folder = subfolder ? `${FOLDER}/${subfolder}` : FOLDER;
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image', transformation: [{ quality: 'auto', fetch_format: 'auto' }] },
      (err, result) => {
        if (err) return reject(err);
        resolve({ url: result.secure_url, public_id: result.public_id });
      }
    );
    stream.end(buffer);
  });
}

export async function deleteImage(public_id) {
  if (!public_id) return;
  try {
    await cloudinary.uploader.destroy(public_id);
  } catch (err) {
    console.error('Error eliminando imagen Cloudinary:', err.message);
  }
}

export { cloudinary };
