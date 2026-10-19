import sharp from "sharp";
import {fileURLToPath} from "node:url";
// Match the book crop used by the React sidebar SVG, then pad for Windows icons.
const source=fileURLToPath(new URL("../public/trp-logo.png",import.meta.url));
const output=fileURLToPath(new URL("../src-tauri/app-icon.png",import.meta.url));
await sharp(source).extract({left:296,top:381,width:1408,height:1239}).resize(920,920,{fit:"contain",background:{r:0,g:0,b:0,alpha:0},kernel:"nearest"}).extend({top:52,bottom:52,left:52,right:52,background:{r:0,g:0,b:0,alpha:0}}).png().toFile(output);
console.log("Prepared the website book logo for native app icons.");
