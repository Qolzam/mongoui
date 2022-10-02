const fs = require('fs')
const path = require('path')

 const getAppRootDir  = ( ) => {
  let currentDir = __dirname
  while(!fs.existsSync(path.join(currentDir, 'package.json'))) {
    currentDir = path.join(currentDir, '..')
  }
  return currentDir
}

exports.getAppRootDir = getAppRootDir