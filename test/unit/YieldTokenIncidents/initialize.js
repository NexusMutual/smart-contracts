const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('initialize', function () {
  it('reverts if the contract was already initialized', async function () {
    const { yieldTokenIncidents } = this.contracts;
    await expect(yieldTokenIncidents.initialize()).to.be.revertedWith('Already initialized');
  });

  it('should set config parameters', async function () {
    const { nxm, coverNFT } = this.contracts;

    const YieldTokenIncidents = await ethers.getContractFactory('YieldTokenIncidents');
    const yieldTokenIncidents = await YieldTokenIncidents.deploy(nxm.address, coverNFT.address);

    const beforeInitializeConfig = await yieldTokenIncidents.config();

    expect(beforeInitializeConfig.rewardRatio).to.be.equal(0);
    expect(beforeInitializeConfig.expectedPayoutRatio).to.be.equal(0);
    expect(beforeInitializeConfig.payoutDeductibleRatio).to.be.equal(0);
    expect(beforeInitializeConfig.payoutRedemptionPeriodInDays).to.be.equal(0);
    expect(beforeInitializeConfig.maxRewardInNXMWad).to.be.equal(0);

    yieldTokenIncidents.initialize();

    const afterInitializeConfig = await yieldTokenIncidents.config();

    expect(afterInitializeConfig.rewardRatio).to.be.equal(130);
    expect(afterInitializeConfig.expectedPayoutRatio).to.be.equal(3000);
    expect(afterInitializeConfig.payoutDeductibleRatio).to.be.equal(9000);
    expect(afterInitializeConfig.payoutRedemptionPeriodInDays).to.be.equal(14);
    expect(afterInitializeConfig.maxRewardInNXMWad).to.be.equal(50);
  });
});
