const { ethers } = require('hardhat');
const { time } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const { submitClaim, EVENT_TYPE, daysToSeconds } = require('./helpers');
const { arrayify } = ethers.utils;

describe('submitFraud', function () {
  it('can only be called by governance contract', async function () {
    const { assessment } = this.contracts;
    const user = this.accounts.members[0];
    const governance = this.accounts.governanceContracts[0];
    const merkleTreeRootMock = arrayify('0x1111111111111111111111111111111111111111111111111111111111111111');
    expect(assessment.connect(user).submitFraud(merkleTreeRootMock)).to.be.revertedWith(
      'Caller is not authorized to govern',
    );
    expect(assessment.connect(governance).submitFraud(merkleTreeRootMock)).not.to.be.revertedWith(
      'Caller is not authorized to govern',
    );
  });
});
