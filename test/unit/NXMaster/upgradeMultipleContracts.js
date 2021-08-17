const { artifacts } = require('hardhat');
const { constants: { ZERO_ADDRESS }, ether, expectRevert } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const { hex } = require('../utils').helpers;

describe('upgradeMultipleContracts', function () {

  it('reverts when not called by governance', async function () {
    const { master } = this;

    await expectRevert(
      master.upgradeMultipleContracts([], []),
      'Not authorized',
    );
  });

  it('reverts when contract code does not exist', async function () {
    const { governance } = this;

    await expectRevert(
      governance.upgradeMultipleContracts([hex('XX')], ['0x0000000000000000000000000000000000000001']),
      'NXMaster: Non-existant or non-upgradeable contract code',
    );
  });

  it('reverts when contract address is 0t', async function () {
    const { governance } = this;

    await expectRevert(
      governance.upgradeMultipleContracts([hex('GV')], [ZERO_ADDRESS]),
      'NXMaster: Contract address is 0',
    );
  });
});
