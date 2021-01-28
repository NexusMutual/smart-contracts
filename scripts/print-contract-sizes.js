const glob = require('glob');

glob('../artifacts/**/*.json', function (err, files) {

  if (err) {
    console.log('Error', err.stack);
    process.exit(1);
  }

  for (const filepath of files) {

    if (filepath.endsWith('dbg.json') || filepath.includes('build-info')) {
      continue;
    }

    const file = require(filepath);
    const chunks = filepath.split('/');
    const name = chunks[chunks.length - 2];
    const size = file.bytecode.length / 2;

    size > 24000
      ? console.error(`${name}: ${size}`)
      : console.log(`${name}: ${size}`);
  }
});
