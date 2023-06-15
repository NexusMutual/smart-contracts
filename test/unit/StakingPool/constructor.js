const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-toolbox/network-helpers');
const setup = require('./setup');

describe('constructor', function () {
  let fixture;
  beforeEach(async function () {
    fixture = await loadFixture(setup);
  });

  it('should set nxm, cover and tokenController addresses correctly', async function () {
    const { stakingProducts, stakingNFT, nxm, cover, tokenController, master } = fixture;

    const StakingPool = await ethers.getContractFactory('StakingPool');
    const stakingPool = await StakingPool.deploy(
      stakingNFT.address,
      nxm.address,
      cover.address,
      tokenController.address,
      master.address,
      stakingProducts.address,
    );

    const stakingNFTAddress = await stakingPool.stakingNFT();
    const nxmAddress = await stakingPool.nxm();
    const coverAddress = await stakingPool.coverContract();
    const tokenControllerAddress = await stakingPool.tokenController();
    const masterAddress = await stakingPool.masterContract();
    const stakingProductsAddress = await stakingPool.stakingProducts();

    expect(stakingNFTAddress).to.be.equal(stakingNFT.address);
    expect(nxmAddress).to.be.equal(nxm.address);
    expect(coverAddress).to.be.equal(cover.address);
    expect(tokenControllerAddress).to.be.equal(tokenController.address);
    expect(masterAddress).to.be.equal(master.address);
    expect(stakingProductsAddress).to.be.equal(stakingProducts.address);
  });
});
