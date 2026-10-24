export type ImagePreparation = {maxWidth?: number; maxHeight?: number; maxLength: number; gallery?: boolean};
export async function prepareUploadImage(file: File, options: ImagePreparation): Promise<string> {
  if(!["image/jpeg","image/png","image/webp"].includes(file.type))throw Error("Choose a JPG, PNG or WebP image.");
  if(file.size>10*1024*1024)throw Error("Each image must be under 10 MB.");
  const bitmap=await createImageBitmap(file).catch(()=>{throw Error("This image could not be opened.")});
  try {
    if(!bitmap.width||!bitmap.height||bitmap.width*bitmap.height>40000000)throw Error("Choose an image smaller than 40 megapixels.");
    const scale=Math.min(1,options.maxWidth ? options.maxWidth/bitmap.width : 1,options.maxHeight ? options.maxHeight/bitmap.height : 1);
    const canvas=document.createElement("canvas");
    canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    const context=canvas.getContext("2d");if(!context)throw Error("Image processing is unavailable.");
    context.fillStyle="#252525";context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);
    for(const quality of options.gallery ? [.92,.82,.65,.45] : [.82,.65,.45,.3]){
      const src=canvas.toDataURL("image/jpeg",quality);if(src.length<=options.maxLength)return src;
    }
    throw Error(options.gallery ? "This image cannot fit the gallery's storage limit at its original resolution. Choose a smaller file; it has not been resized or uploaded." : "This image is too detailed. Choose a smaller image.");
  } finally {bitmap.close();}
}