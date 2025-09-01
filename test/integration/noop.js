import { network } from 'hardhat';

import setup from './setup.js';

const connection = await network.connect();
const { loadFixture } = connection.networkHelpers;

describe('noop', () => {
  it('should call setup', async () => {
    // eslint-disable-next-line no-unused-vars
    const fixture = await loadFixture(function getSetup() {
      return setup(connection);
    });
    console.log('noop finished!');
  });
});
