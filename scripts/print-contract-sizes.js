const glob = require('glob');
const fs = require('fs');

const getDirectoriesAndFiles = function (src, callback) {
  glob(src + '/**/*', callback);
};

getDirectoriesAndFiles('../artifacts', function (err, dirsAndFiles) {
  if (err) {
    console.log('Error', err.stack);
    process.exit(1);
  } else {
    for (const node of dirsAndFiles) {
      if (node.endsWith('.json') && !node.endsWith('dbg.json')) {
        if (node.includes('build-info')) {
          continue;
        }
        const file = JSON.parse(fs.readFileSync(node, 'utf8'));
        const chunks = node.split('/');
        const name = chunks[chunks.length - 2];
        console.log(`${name}: ${file.bytecode.length / 2}`);
      }
    }
  }
});
