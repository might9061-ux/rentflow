// Read an uploaded receipt/screenshot into a data URL. Images are downscaled
// (max ~1000px, JPEG q0.72) so they stay small for the demo's localStorage and
// for quick previews. Non-images (e.g. PDF) are read as-is with a size cap.
//
// In production these would upload to a Supabase Storage bucket instead and the
// payment would store the public/signed URL — see README "Payment proofs".

const MAX_DIM = 1000
const MAX_RAW_BYTES = 2.5 * 1024 * 1024

// Read an image into a small, square (center-cropped) data URL for avatars.
export function fileToAvatar(file, size = 256) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('No file selected.'))
    if (!file.type.startsWith('image/')) return reject(new Error('Please choose an image.'))
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read the file.'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('That image could not be loaded.'))
      img.onload = () => {
        const side = Math.min(img.width, img.height)
        const sx = (img.width - side) / 2, sy = (img.height - side) / 2
        const canvas = document.createElement('canvas')
        canvas.width = size; canvas.height = size
        canvas.getContext('2d').drawImage(img, sx, sy, side, side, 0, 0, size, size)
        resolve(canvas.toDataURL('image/jpeg', 0.8))
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

export function fileToProof(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('No file selected.'))
    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onerror = () => reject(new Error('Could not read the file.'))
      reader.onload = () => {
        const img = new Image()
        img.onerror = () => reject(new Error('That image could not be loaded.'))
        img.onload = () => {
          const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height))
          const w = Math.round(img.width * scale), h = Math.round(img.height * scale)
          const canvas = document.createElement('canvas')
          canvas.width = w; canvas.height = h
          canvas.getContext('2d').drawImage(img, 0, 0, w, h)
          resolve({ url: canvas.toDataURL('image/jpeg', 0.72), type: 'image', name: file.name })
        }
        img.src = reader.result
      }
      reader.readAsDataURL(file)
    } else {
      if (file.size > MAX_RAW_BYTES) return reject(new Error('File is too large (max 2.5 MB).'))
      const reader = new FileReader()
      reader.onerror = () => reject(new Error('Could not read the file.'))
      reader.onload = () => resolve({ url: reader.result, type: 'file', name: file.name })
      reader.readAsDataURL(file)
    }
  })
}
