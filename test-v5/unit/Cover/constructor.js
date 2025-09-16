const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('constructor', function () {
  it('should set variables correctly', async function () {
    const coverNFT = '0x0000000000000000000000000000000000000001';
    const stakingNFT = '0x0000000000000000000000000000000000000002';
    const stakingPoolFactory = '0x0000000000000000000000000000000000000003';
    const stakingPoolImplementation = '0x0000000000000000000000000000000000000004';

    const Cover = await ethers.getContractFactory('Cover');
    const cover = await Cover.deploy(coverNFT, stakingNFT, stakingPoolFactory, stakingPoolImplementation);

    expect(await cover.coverNFT()).to.equal(coverNFT);
    expect(await cover.stakingNFT()).to.equal(stakingNFT);
    expect(await cover.stakingPoolFactory()).to.equal(stakingPoolFactory);
    expect(await cover.stakingPoolImplementation()).to.equal(stakingPoolImplementation);
  });
});
