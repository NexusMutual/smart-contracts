const { expect } = require('chai');
const { ethers } = require('hardhat');
const { hex } = require('../../utils').helpers;

describe('initialize', function () {
  it('reverts if the contract was already initialized', async function () {
    const { assessment } = this.contracts;
    await expect(assessment.initialize()).to.be.revertedWith('Already initialized');
  });

  it('should set config parameters', async function () {
    const { nxm, master } = this.contracts;

    const Assessment = await ethers.getContractFactory('Assessment');
    const assessment = await Assessment.deploy(nxm.address);

    await master.setLatestAddress(hex('AS'), assessment.address);
    await assessment.changeMasterAddress(master.address);
    await assessment.changeDependentContractAddress();

    const preInitializeConfig = await assessment.config();

    expect(preInitializeConfig.minVotingPeriodInDays).to.be.equals(0);
    expect(preInitializeConfig.stakeLockupPeriodInDays).to.be.equals(0);
    expect(preInitializeConfig.payoutCooldownInDays).to.be.equals(0);
    expect(preInitializeConfig.silentEndingPeriodInDays).to.be.equals(0);

    await assessment.initialize();
    const afterInitializeConfig = await assessment.config();

    expect(afterInitializeConfig.minVotingPeriodInDays).to.be.to.be.equals(3);
    expect(afterInitializeConfig.stakeLockupPeriodInDays).to.be.equals(14);
    expect(afterInitializeConfig.payoutCooldownInDays).to.be.equals(1);
    expect(afterInitializeConfig.silentEndingPeriodInDays).to.be.equals(1);
  });

  it('should be whitelisted', async function () {
    const { tokenController, nxm, master } = this.contracts;

    const Assessment = await ethers.getContractFactory('Assessment');
    const assessment = await Assessment.deploy(nxm.address);

    await master.setLatestAddress(hex('AS'), assessment.address);
    await assessment.changeMasterAddress(master.address);
    await assessment.changeDependentContractAddress();

    expect(await tokenController.addToWhitelistLastCalledWith()).to.not.be.equal(assessment.address);
    await assessment.initialize();
    expect(await tokenController.addToWhitelistLastCalledWith()).to.be.equal(assessment.address);
  });
});
