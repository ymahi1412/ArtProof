/**
 * IPFS uploads via Pinata's free tier (1GB storage, no credit card required).
 * Docs: https://docs.pinata.cloud
 *
 * SETUP (do this once):
 *   1. Sign up free at https://app.pinata.cloud
 *   2. Go to Developers -> API Keys -> "New Key"
 *   3. Give it a *scoped* key — only enable the "pinFileToIPFS" and
 *      "pinJSONToIPFS" permissions, nothing else. This limits the blast
 *      radius since this key ends up visible in browser devtools (see note below).
 *   4. Copy the JWT it gives you into frontend/.env as:
 *        VITE_PINATA_JWT=your_jwt_here
 *   5. Restart `npm run dev` after adding/changing .env (Vite only reads it on startup).
 *
 * KNOWN LIMITATION — read before treating this as production-ready:
 * This app has no backend, so this JWT is bundled into the browser JS and is
 * visible to anyone who opens devtools. That's acceptable for a scoped,
 * free-tier demo key on a student project, but would NOT be safe for a real
 * production deployment — a real app would proxy uploads through a backend
 * that holds the secret key server-side instead.
 */

const PINATA_JWT = import.meta.env.VITE_PINATA_JWT;
const PIN_FILE_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS";
const PIN_JSON_URL = "https://api.pinata.cloud/pinning/pinJSONToIPFS";

function assertConfigured() {
  if (!PINATA_JWT) {
    throw new Error(
      "IPFS isn't configured yet. Add VITE_PINATA_JWT to frontend/.env (see comment at top of src/utils/ipfs.js) and restart `npm run dev`."
    );
  }
}

/** Uploads a File (e.g. from an <input type="file">) to IPFS. Returns an ipfs://<cid> URI. */
export async function uploadFileToIPFS(file) {
  assertConfigured();

  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(PIN_FILE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PINATA_JWT}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`IPFS image upload failed (${response.status}): ${text || response.statusText}`);
  }

  const result = await response.json();
  return `ipfs://${result.IpfsHash}`;
}

/** Uploads a plain JS object as JSON to IPFS. Returns an ipfs://<cid> URI. */
export async function uploadJSONToIPFS(data) {
  assertConfigured();

  const response = await fetch(PIN_JSON_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PINATA_JWT}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ pinataContent: data }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`IPFS metadata upload failed (${response.status}): ${text || response.statusText}`);
  }

  const result = await response.json();
  return `ipfs://${result.IpfsHash}`;
}

/**
 * Convenience wrapper for the Register flow: uploads an artwork image (if
 * provided), builds a standard-shaped metadata JSON object, uploads that,
 * and returns the final metadata URI to pass into mintCertificate().
 */
export async function uploadArtworkMetadata({ title, description, artistAddress, imageFile }) {
  let imageUri = "";
  if (imageFile) {
    imageUri = await uploadFileToIPFS(imageFile);
  }

  const metadata = {
    name: title,
    description,
    image: imageUri || undefined,
    attributes: {
      artist: artistAddress,
      createdAt: new Date().toISOString(),
    },
  };

  return uploadJSONToIPFS(metadata);
}

export function isIpfsConfigured() {
  return Boolean(PINATA_JWT);
}
