const fs = require('fs');
const path = require('path');
const { getenv } = require('./env');

const updateOzConfig = addresses => {

  const network = getenv('NETWORK').toLowerCase();
  const file = path.join(process.cwd(), '.openzeppelin', `${network}.json`);
  let data;

  if (!fs.existsSync(file)) {
    data = { solidityLibs: {}, proxies: {}, manifestVersion: '2.2', version: '1.0.0' };
  } else {
    data = JSON.parse(fs.readFileSync(file).toString());
  }

  for (const contract of Object.keys(addresses)) {
    const key = `pooled-staking/${contract}`;
    const address = addresses[contract];
    data.proxies[key] = [{ address, kind: 'NonProxy' }];
  }

  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  console.log(`Config updated: .openzeppelin/${network}.json`);
};

module.exports = {
  updateOzConfig,
};
