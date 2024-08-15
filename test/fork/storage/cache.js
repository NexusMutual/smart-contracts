const fs = require('node:fs/promises');
const path = require('path');

const { BigNumber } = require('ethers');

const parseCache = item => {
  if (item && item.type === 'BigNumber' && item.hex) {
    return BigNumber.from(item);
  }

  if (Array.isArray(item)) {
    return item.map(parseCache);
  }

  if (typeof item === 'object') {
    const entries = Object.entries(item);
    return entries.reduce((acc, [key, value]) => ({ ...acc, [key]: parseCache(value) }), {});
  }

  return item;
};

const load = async (fileName, defaultState = {}) => {
  const filePath = path.join(__dirname, 'data', fileName);
  const exists = await fileExists(filePath);
  if (!exists) {
    return defaultState;
  }

  const contents = await fs.readFile(filePath, 'utf8');
  const parsedData = parseCache(JSON.parse(contents));

  // refresh constants values
  parsedData.assets = { ...defaultState.assets };
  parsedData.productPriorityPoolsFixedPrice = { ...defaultState.productPriorityPoolsFixedPrice };

  console.info(`Loaded ${fileName}`);

  return parsedData;
};

const fileExists = async path =>
  fs
    .access(path)
    .then(() => true)
    .catch(() => false);

const save = async (storage, fileName) => {
  const serialized = JSON.stringify(storage, null, 2);
  const storagePath = path.join(__dirname, 'data', fileName);
  await fs.writeFile(storagePath, serialized);
  console.info(`Successfully save ${fileName}`);
};

const clear = async storagePath => {
  await fs.unlink(storagePath);
};

module.exports = {
  parseCache,
  clear,
  load,
  save,
};
