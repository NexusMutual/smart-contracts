const { accounts, web3 } = require('hardhat');
const { expectEvent, expectRevert, time } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const { ProposalCategory } = require('../utils').constants;
const { hex } = require('../utils').helpers;

const [owner, emergencyAdmin, unknown] = accounts;

describe('emergency pause', function () {

  it('should revert when not called by emergency admin', async function () {

    const { master } = this.contracts;

    await expectRevert(master.setEmergencyPause(true, { from: unknown }), 'NXMaster: Not emergencyAdmin');
  });

  it('should be able to start and end emergency pause', async function () {

    const { master, gv, pc, tk } = this.contracts;

    assert.equal(await master.isPause(), false);

    await master.setEmergencyPause(true, {
      from: emergencyAdmin,
    });

    assert.equal(await master.isPause(), true);

    await master.setEmergencyPause(false, {
      from: emergencyAdmin,
    });

    assert.equal(await master.isPause(), false);
  });
});
