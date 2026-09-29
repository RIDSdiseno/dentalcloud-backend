import cloudinary from './cloudinary';

export function isPngDataUrl(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('data:image/png;base64,') && value.length > 'data:image/png;base64,'.length;
}

// Firma dibujada por el propio profesional (canvas) — al crear su cuenta, o
// después desde su perfil (29/09: agregado el "después", antes solo se
// podía al crear la cuenta). Se manda como data URL y se sube directo a
// Cloudinary con `overwrite: true` sobre el mismo public_id (el id del
// usuario), así volver a firmar reemplaza la firma anterior sin dejar
// archivos huérfanos. Es opcional: si falla la subida, no bloquea nada, solo
// queda sin firma.
export async function uploadUserSignature(
  dataUrl: string,
  clinicaId: string,
  userId: string
): Promise<{ url: string; publicId: string } | null> {
  try {
    const result = await cloudinary.uploader.upload(dataUrl, {
      resource_type: 'image',
      folder: `dentalcloud/${clinicaId}/firmas-profesionales`,
      public_id: userId,
      overwrite: true,
    });
    return { url: result.secure_url, publicId: result.public_id };
  } catch (err) {
    console.error('No se pudo subir la firma del profesional', err);
    return null;
  }
}

export async function deleteUserSignature(publicId: string): Promise<void> {
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
  } catch (err) {
    console.error('No se pudo eliminar la firma en Cloudinary', err);
  }
}
