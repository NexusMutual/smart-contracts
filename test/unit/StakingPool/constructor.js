const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('constructor', function () {
  it('should set nxm, cover and tokenController addresses correctly', async function () {
    const { nxm, cover, tokenController } = this;

    const StakingPool = await ethers.getContractFactory('StakingPool');
    const stakingPool = await StakingPool.deploy(nxm.address, cover.address, tokenController.address);

    const nxmAddress = await stakingPool.nxm();
    const coverAddress = await stakingPool.coverContract();
    const tokenControllerAddress = await stakingPool.tokenController();

    expect(nxmAddress).to.be.equal(nxm.address);
    expect(coverAddress).to.be.equal(cover.address);
    expect(tokenControllerAddress).to.be.equal(tokenController.address);
  });
});
