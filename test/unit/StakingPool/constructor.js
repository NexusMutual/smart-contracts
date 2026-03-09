const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');

describe('constructor', function () {
  it('should set nxm, cover and tokenController addresses correctly', async function () {
    const fixture = await loadFixture(setup);
    const { stakingProducts, stakingNFT, nxm, cover, tokenController, master } = fixture;

    const stakingPool = await ethers.deployContract(
      'StakingPool',
      [stakingNFT, nxm, cover, tokenController, master, stakingProducts].map(c => c.target),
    );

    const stakingNFTAddress = await stakingPool.stakingNFT();
    const nxmAddress = await stakingPool.nxm();
    const coverAddress = await stakingPool.coverContract();
    const tokenControllerAddress = await stakingPool.tokenController();
    const masterAddress = await stakingPool.masterContract();
    const stakingProductsAddress = await stakingPool.stakingProducts();

    expect(stakingNFTAddress).to.be.equal(stakingNFT.target);
    expect(nxmAddress).to.be.equal(nxm.target);
    expect(coverAddress).to.be.equal(cover.target);
    expect(tokenControllerAddress).to.be.equal(tokenController.target);
    expect(masterAddress).to.be.equal(master.target);
    expect(stakingProductsAddress).to.be.equal(stakingProducts.target);
  });
});
