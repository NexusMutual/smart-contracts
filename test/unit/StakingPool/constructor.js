const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');

describe('constructor', function () {
  // currently cannot be tested because the addresses have been set as internal
  it.skip('should set nxm, cover and tokenController addresses correctly', async function () {
    const fixture = await loadFixture(setup);
    const { stakingProducts, stakingNFT, nxm, cover, tokenController, master } = fixture;

    const stakingExtrasLib = await ethers.deployContract('StakingExtrasLib');
    await stakingExtrasLib.deployed();

    const stakingPool = await ethers.deployContract(
      'StakingPool',
      [stakingNFT, nxm, cover, tokenController, master, stakingProducts].map(c => c.address),
      { libraries: { StakingExtrasLib: stakingExtrasLib.address } },
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
