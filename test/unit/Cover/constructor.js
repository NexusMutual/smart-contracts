const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('constructor', function () {
  it('should set variables correctly', async function () {
    const { productsV1, quotationData, stakingPool, futureCoverNFTAddress, coverAddress, coverUtilsLib } = this;

    const Cover = await ethers.getContractFactory('Cover', {
      libraries: {
        CoverUtilsLib: coverUtilsLib.address,
      },
    });

    const cover = await Cover.deploy(
      quotationData.address,
      productsV1,
      futureCoverNFTAddress,
      stakingPool.address,
      coverAddress,
    );

    const coverNFT = await cover.coverNFT();
    const stakingPoolProxyCodeHash = await cover.stakingPoolProxyCodeHash();
    const stakingPoolImplementation = await cover.stakingPoolImplementation();

    expect(coverNFT).to.be.equal(futureCoverNFTAddress);
    expect(stakingPoolImplementation).to.be.equal(stakingPool.address);
    expect(stakingPoolProxyCodeHash).to.be.equal(await coverUtilsLib.calculateProxyCodeHash(coverAddress));
  });
});
