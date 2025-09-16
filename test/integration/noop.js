const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');

describe('noop', () => {
  it('should call setup', async () => {
    // eslint-disable-next-line no-unused-vars
    const fixture = await loadFixture(setup);
    console.log('noop finished!');
  });
});
