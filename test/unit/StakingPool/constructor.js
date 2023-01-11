const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('constructor', function () {
  it('should set nxm, cover and tokenController addresses correctly', async function () {
    const { stakingNFT, nxm, cover, tokenController, master } = this;

    const StakingPool = await ethers.getContractFactory('StakingPool');
    const stakingPool = await StakingPool.deploy(
      stakingNFT.address,
      nxm.address,
      cover.address,
      tokenController.address,
      master.address,
    );

    const stakingNFTAddress = await stakingPool.stakingNFT();
    const nxmAddress = await stakingPool.nxm();
    const coverAddress = await stakingPool.coverContract();
    const tokenControllerAddress = await stakingPool.tokenController();
    const masterAddress = await stakingPool.masterContract();

    expect(stakingNFTAddress).to.be.equal(stakingNFT.address);
    expect(nxmAddress).to.be.equal(nxm.address);
    expect(coverAddress).to.be.equal(cover.address);
    expect(tokenControllerAddress).to.be.equal(tokenController.address);
    expect(masterAddress).to.be.equal(master.address);
  });
});
