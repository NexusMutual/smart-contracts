const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

// This is a fixture's sole purpose is to take a snapshot of a clean state before ANY test runs.
// It's supposed be inherited by all setup fixtures that need a clean state.

const init = async () => {
  // noop
};

const mochaHooks = {
  beforeAll: () => loadFixture(init),
};

module.exports = { mochaHooks, init };
