const { artifacts } = require('hardhat');
const { constants: { ZERO_ADDRESS }, ether, expectRevert } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');

describe('upgradeMultipleContracts', function () {

  it('reverts when not called by governance', async function () {
    const { master } = this;

    await expectRevert(
      master.upgradeMultipleContracts([], []),
      'Not authorized',
    );
  });
});
