const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');

const VOTING_PERIOD = 3 * 24 * 60 * 60; // 3 days in seconds

describe('votingPeriod', function () {
  it('should return the correct voting period constant', async function () {
    const { contracts } = await loadFixture(setup);
    const { assessment } = contracts;

    const votingPeriod = await assessment.votingPeriod();

    expect(votingPeriod).to.equal(VOTING_PERIOD);
  });
});
