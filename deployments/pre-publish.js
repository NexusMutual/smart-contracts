const fs = require('node:fs');
const path = require('node:path');
const { config } = require('hardhat');

const rootPath = config.paths.root;

const updateVersion = () => {
  const rootPackageJson = path.join(rootPath, 'package.json');
  const deploymentsPackageJson = path.join(rootPath, 'deployments/package.json');

  const { version } = require(rootPackageJson);
  const deploymentJson = require(path.join(deploymentsPackageJson));

  const updatedJson = JSON.stringify({ ...deploymentJson, version }, null, 2);
  fs.writeFileSync(deploymentsPackageJson, updatedJson);
  console.log('Updated deployments/package.json with version: ', version);
};

const rimraf = file => {
  if (!fs.existsSync(file)) {
    return;
  }

  if (fs.lstatSync(file).isDirectory()) {
    fs.readdirSync(file).forEach(item => rimraf(path.join(file, item)));
    fs.rmdirSync(file);
    return;
  }

  fs.unlinkSync(file);
};

const generateExports = () => {
  console.log('Generating abi exports');

  // input
  const abisPath = path.join(__dirname, 'src/abis/');
  const addressesPath = path.join(__dirname, 'src/addresses.json');

  // output
  const abiExportsDir = path.join(__dirname, 'dist/abis');
  const abiExportsFile = path.join(__dirname, 'dist/abis.js');
  const addressesExportsFile = path.join(__dirname, 'dist/addresses.js');
  const entrypointExportsFile = path.join(__dirname, 'dist/index.js');

  rimraf(abiExportsDir);
  fs.mkdirSync(abiExportsDir, { recursive: true });

  const abis = fs
    .readdirSync(abisPath)
    .filter(file => file.endsWith('.json'))
    .map(file => file.replace('.json', ''));

  for (const name of abis) {
    const abi = fs.readFileSync(path.join(abisPath, `${name}.json`)).toString();
    fs.writeFileSync(path.join(abiExportsDir, `${name}.js`), `module.exports = ${abi.trim()};\n`);
  }

  const imports = abis.map(abi => `const ${abi} = require('./abis/${abi}.js');`);
  const moduleExports = `module.exports = {\n${abis.map(abi => `  ${abi},`).join('\n')}\n};`;
  fs.writeFileSync(abiExportsFile, [...imports, '', moduleExports, ''].join('\n'));

  const addresses = fs.readFileSync(addressesPath).toString().trim().replace(/"/g, "'");
  fs.writeFileSync(addressesExportsFile, `module.exports = ${addresses};\n`);

  const entrypointExports = [
    `const abis = require('./abis.js');`,
    `const addresses = require('./addresses.js');`,
    `module.exports = { abis, addresses };`,
    '',
  ].join('\n');

  fs.writeFileSync(entrypointExportsFile, entrypointExports);
};

updateVersion();
generateExports();

process.exit(0);
