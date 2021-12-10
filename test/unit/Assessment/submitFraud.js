const { ethers } = require('hardhat');
const { expect } = require('chai');
const { arrayify } = ethers.utils;

describe('submitFraud', function () {
  it('can only be called by governance contract', async function () {
    const { assessment } = this.contracts;
    const user = this.accounts.members[0];
    const governance = this.accounts.governanceContracts[0];
    const merkleTreeRootMock = arrayify('0x1111111111111111111111111111111111111111111111111111111111111111');
    await expect(assessment.connect(user).submitFraud(merkleTreeRootMock)).to.be.revertedWith(
      'Caller is not authorized to govern',
    );
    await expect(assessment.connect(governance).submitFraud(merkleTreeRootMock)).not.to.be.revertedWith(
      'Caller is not authorized to govern',
    );
  });
});
