const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');

describe('minVotingPeriod', function () {
  it('returns the expected minimum voting period', async function () {
    const { contracts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { MIN_VOTING_PERIOD } = constants;

    const period = await assessment.minVotingPeriod();
    expect(period).to.equal(MIN_VOTING_PERIOD);
  });
});
