import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

 const getAppRootDir  = ( ) => {
  let currentDir = __dirname
  while(!fs.existsSync(path.join(currentDir, 'package.json'))) {
    currentDir = path.join(currentDir, '..')
  }
  return currentDir
}

export {getAppRootDir,  __dirname}