const { assert } = require('chai');
const { ether, time, expectRevert } = require('@openzeppelin/test-helpers');
const { initMCR } = require('./common');

const accounts = require('../utils').accounts;
const { MCRUintParamType } = require('../utils').constants;

const {
  nonMembers: [nonMember],
  members: [member],
  advisoryBoardMembers: [advisoryBoardMember],
  internalContracts: [internalContract],
  governanceContracts: [governanceContract],
  generalPurpose: [generalPurpose],
} = accounts;

describe.only('getMCR', function () {

  it('should return the initial MCR value if MCR == desired MCR and no update happened', async function () {
    const { master } = this;

    const mcr = await initMCR({
      mcrValue: ether('150000'),
      mcrFloor: ether('150000'),
      desiredMCR: ether('150000'),
      mcrFloorIncrementThreshold: '13000',
      maxMCRFloorIncrement: '100',
      maxMCRIncrement: '500',
      gearingFactor: '48000',
      minUpdateTime: '3600',
      master,
    });

    const storedMCR = await mcr.mcr();
    const newestMCR = await mcr.getMCR();
    assert.equal(newestMCR.toString(), storedMCR.toString());
  });

  it.only('should return same MCR value if MCR == desired MCR and no update happened', async function () {
    const { master } = this;

    const mcr = await initMCR({
      mcrValue: ether('150000'),
      mcrFloor: ether('150000'),
      desiredMCR: ether('160000'),
      mcrFloorIncrementThreshold: '13000',
      maxMCRFloorIncrement: '100',
      maxMCRIncrement: '500',
      gearingFactor: '48000',
      minUpdateTime: '3600',
      master,
    });

    await time.increase(3600 * 12);

    const storedMCR = await mcr.mcr();
    const newestMCR = await mcr.getMCR();
    assert.equal(newestMCR.toString(), storedMCR.toString());
  });
});
