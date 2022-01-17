// This script takes a collection of WizardDAO layer pngs and generates the RLE 
// encoded data set.

import { readPngFile } from 'node-libpng';
import { PNGCollectionEncoder, buildSVG as render, EncodedImage } from '../../sdk/src/image'
import { promises as fs } from 'fs';
import { resolve, extname, basename } from 'path';

// ts-node encodeImages.ts <path> <buildSVG(bool)> > example.svg
(async function () {
  const encoder = new PNGCollectionEncoder();

  let buildSVG = false
  let numOfWizards = 1;
  let path = "./"
  const args = process.argv.slice(2);
  if (args.length) {
    path = args[0]

    if (args.length > 1) {
      buildSVG = strToBool(args[1])
    }

    if (args.length > 2) {
      numOfWizards = +args[2]
    }
  }

  const files = await getFiles(path)

  type ImageD = {
    rawName: string,
    image: string,
    folder: string,
    folderIndex: number,
  }

  const inFolders = new Map<string, ImageD>()
  const folders : string[] = []
  const pngs = files.filter((f: string) => extname(f) == '.png')
  for (const f of pngs) {
    const image = await readPngFile(f);
    const rawName = basename(f).replace(extname(f), '')
    const folder = rawName.substr(0, rawName.indexOf('_'))

    // keep track of folders
    if (folders.indexOf(folder)=== -1) {
      folders.push(folder)
    }

    const folderIndex = rawName.substr(rawName.indexOf('_')+1)
    if (folder in inFolders) {
      inFolders[folder].push({rawName, image, folder, folderIndex})
    } else {
      inFolders[folder]= [{rawName, image, folder, folderIndex}]
    }    
  }
  folders.sort()

  // sort items in each folder to be numerical order then encode them to keep palette indexes 
  // in sync
  for (let i = 0; i < folders.length; i++) {
    inFolders[folders[i]] = inFolders[folders[i]].sort((a, b)=> a.folderIndex-b.folderIndex)
  }

  for (let i = 0; i < folders.length; i++) {
    // get folder as first part of filename_ i.e. Hat_default.png Skin_light.png
    const images = inFolders[folders[i]]
    for (let j = 0; j < images.length; j++) {
      const imagedata = images[j]
      const rawName = imagedata.rawName;
      const image = imagedata.image;
      const folder = imagedata.folder;
      encoder.encodeImage(rawName, image, folder)
    }
  }
  
  await encoder.writeToFile('../../files/image-data.json')

  if (buildSVG) {
    for (let i = 0; i < numOfWizards; i++) {
      // wizard, cool, warm
      const bgColors = ["c5a3e2", "a4addd", "e0a4ad"];
      const pallette = encoder.data.palette
      const groups = encoder.data.images

      // group render order
      let order = ["skin", "cloth", "eye", "mouth", "acc", "item", "hat"];
      
      let parts: EncodedImage[] = [];
      order.forEach(f => {
        // get random part
        var part = groups[f][Math.floor(Math.random() * groups[f].length)]
        parts.push(part)
      })

      // parts.reverse()
      const randomBG = bgColors[Math.floor(Math.random() * bgColors.length)]
      await fs.writeFile(`../../files/out/${i+1}.svg`, render(parts, pallette, randomBG));
    }
  }
})();

// getFiles returns files in a directory recursively
async function getFiles(dir) {
  const dirents = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(dirents.map((dirent) => {
    const res = resolve(dir, dirent.name);
    return dirent.isDirectory() ? getFiles(res) : res;
  }));
  return Array.prototype.concat(...files);
}

function strToBool(s: string): boolean {
    // will match one and only one of the string 'true','1', or 'on' rerardless
    // of capitalization and regardless off surrounding white-space.
    const regex =/^\s*(true|1|on)\s*$/i
    return regex.test(s);
}