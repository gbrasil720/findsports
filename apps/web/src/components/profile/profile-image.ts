export function compressProfileImage(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Invalid image data'))
        return
      }
      const image = new Image()
      image.onload = () => {
        const canvas = document.createElement('canvas')
        const size = 200
        canvas.width = size
        canvas.height = size
        const context = canvas.getContext('2d')
        if (!context) {
          reject(new Error('Canvas not supported'))
          return
        }
        const minDimension = Math.min(image.width, image.height)
        const sourceX = (image.width - minDimension) / 2
        const sourceY = (image.height - minDimension) / 2
        context.drawImage(
          image,
          sourceX,
          sourceY,
          minDimension,
          minDimension,
          0,
          0,
          size,
          size
        )
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to compress image'))
              return
            }
            resolve(
              new File([blob], 'avatar.jpg', {
                type: 'image/jpeg'
              })
            )
          },
          'image/jpeg',
          0.85
        )
      }
      image.onerror = reject
      image.src = reader.result
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
