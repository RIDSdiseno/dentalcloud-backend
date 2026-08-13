import cloudinary from './cloudinary';

export class CloudinaryNotConfiguredError extends Error {}

export function assertCloudinaryConfigured() {
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    throw new CloudinaryNotConfiguredError(
      'La subida de fotos no está configurada. Falta CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET en el servidor.'
    );
  }
}

// Mismo flujo de subida (upload_stream de un Buffer en memoria, vía multer)
// que se repetía en cada controller con foto (procedimiento, plan de
// tratamiento, evolución) — extraído acá para no mantener 3+ copias.
export async function uploadImageToCloudinary(
  buffer: Buffer,
  folder: string
): Promise<{ url: string; publicId: string }> {
  const result = await new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({ resource_type: 'image', folder }, (error, result) => {
      if (error || !result) return reject(error);
      resolve(result as { secure_url: string; public_id: string });
    });
    stream.end(buffer);
  });
  return { url: result.secure_url, publicId: result.public_id };
}

export async function deleteImageFromCloudinary(publicId: string): Promise<void> {
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
  } catch (err) {
    console.error('Error eliminando foto de Cloudinary', err);
  }
}
