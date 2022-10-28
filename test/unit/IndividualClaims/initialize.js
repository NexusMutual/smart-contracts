const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('initialize', function () {
  it('reverts if the contract was already initialized', async function () {
    const { individualClaims } = this.contracts;
    await expect(individualClaims.initialize()).to.be.revertedWith('Already initialized');
  });

  it('should set config parameters', async function () {
    const { nxm, coverNFT } = this.contracts;

    const IndividualClaims = await ethers.getContractFactory('IndividualClaims');
    const individualClaims = await IndividualClaims.deploy(nxm.address, coverNFT.address);

    const preInitializeConfig = await individualClaims.config();

    expect(preInitializeConfig.rewardRatio).to.be.equal(0);
    expect(preInitializeConfig.maxRewardInNXMWad).to.be.equal(0);
    expect(preInitializeConfig.minAssessmentDepositRatio).to.be.equal(0);
    expect(preInitializeConfig.payoutRedemptionPeriodInDays).to.be.equal(0);

    await individualClaims.initialize();
    const afterInitializeConfig = await individualClaims.config();

    expect(afterInitializeConfig.rewardRatio).to.be.equal(130);
    expect(afterInitializeConfig.maxRewardInNXMWad).to.be.equal(50);
    expect(afterInitializeConfig.minAssessmentDepositRatio).to.be.equal(500);
    expect(afterInitializeConfig.payoutRedemptionPeriodInDays).to.be.equal(14);
  });
});
