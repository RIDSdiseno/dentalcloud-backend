import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';

// La API v3 de RIDS RX expone un campo `ruta_dcm` por examen para estudios
// 3D/CBCT, pero en la práctica apunta a la CARPETA del estudio (no a un
// archivo puntual) y RIDS RX tampoco genera el `file_list.txt` que el visor
// necesitaría para descubrir las series por su cuenta. En vez de depender de
// que RIDS RX arregle eso, listamos y servimos los .dcm directo desde el
// mismo storage S3/MinIO donde ya viven (mismas credenciales que usa RIDS RX
// internamente) — funciona igual para estudios viejos y nuevos.
function isConfigured() {
  return Boolean(
    process.env.RIDSRX_S3_ENDPOINT && process.env.RIDSRX_S3_ACCESS_KEY_ID && process.env.RIDSRX_S3_SECRET_ACCESS_KEY
  );
}

let client: S3Client | null = null;
function getClient(): S3Client {
  if (!client) {
    client = new S3Client({
      endpoint: process.env.RIDSRX_S3_ENDPOINT,
      region: process.env.RIDSRX_S3_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.RIDSRX_S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.RIDSRX_S3_SECRET_ACCESS_KEY!,
      },
      forcePathStyle: true,
    });
  }
  return client;
}

// Orden natural (3DSlice2 antes que 3DSlice10) — un sort lexicográfico simple
// dejaría las series DICOM en un orden incorrecto.
function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

export async function listOrderDicomFiles(orderId: number | string): Promise<string[]> {
  const bucket = process.env.RIDSRX_S3_BUCKET!;
  const prefix = `ordenes/${orderId}/`;
  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const result = await getClient().send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: continuationToken })
    );
    for (const obj of result.Contents ?? []) {
      if (obj.Key && obj.Key.toLowerCase().endsWith('.dcm')) {
        keys.push(obj.Key.slice(prefix.length));
      }
    }
    continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
  } while (continuationToken);

  return keys.sort(naturalCompare);
}

export async function getDicomFileStream(
  orderId: number | string,
  filename: string
): Promise<NodeJS.ReadableStream | null> {
  const bucket = process.env.RIDSRX_S3_BUCKET!;
  const key = `ordenes/${orderId}/${filename}`;
  const result = await getClient().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return (result.Body as NodeJS.ReadableStream) ?? null;
}

export { isConfigured as isRidsRxStorageConfigured };
