const { ethers } = require('hardhat');
const { expect } = require('chai');
const { setEtherBalance } = require('../../utils/evm');

describe('StakingNFT', function () {
  // impersonate staking pool address
  before(async function () {
    const { stakingPoolLibrary, stakingPoolFactory } = this;
    const poolId = 50;
    const stakingAddress = await stakingPoolLibrary.getAddress(stakingPoolFactory.address, poolId);
    await setEtherBalance(stakingAddress, ethers.utils.parseEther('1000'));
    const stakingPoolSigner = await ethers.getImpersonatedSigner(stakingAddress);

    this.stakingPoolSigner = stakingPoolSigner;
    this.poolId = poolId;
  });
  it('should verify that constructor variables were set correctly', async function () {
    const { stakingNFT } = this;
    expect(await stakingNFT.name()).to.be.eq('NexusMutual Staking');
    expect(await stakingNFT.symbol()).to.be.eq('NXMS');
  });

  // TODO: unskip this test when tokenURI is implemented
  it.skip('should return empty tokenURI for unminted token', async function () {
    const { stakingNFT } = this;
    expect(await stakingNFT.tokenURI(0)).to.be.eq('');
  });

  it('should fail to mint - OnlyStakingPool()', async function () {
    const { stakingNFT } = this;
    const [operator] = this.accounts.members;
    await expect(stakingNFT.connect(operator).mint(this.poolId, operator.address)).to.be.revertedWith(
      'NOT_STAKING_POOL',
    );
  });

  it('should revert if calling stakingPoolOf for a non existent token', async function () {
    const { stakingNFT } = this;
    await expect(stakingNFT.stakingPoolOf(0)).to.be.revertedWith('NOT_MINTED');
  });

  it('should successfully mint', async function () {
    const { stakingNFT } = this;
    const [nftOwner] = this.accounts.members;
    const tokenId = 0;
    await stakingNFT.connect(this.stakingPoolSigner).mint(this.poolId, nftOwner.address);
    expect(await stakingNFT.ownerOf(tokenId)).to.be.equal(nftOwner.address);
    expect(await stakingNFT.stakingPoolOf(tokenId)).to.be.equal(this.poolId);
    const { poolId, owner } = await stakingNFT.tokenInfo(tokenId);
    expect(poolId).to.be.equal(this.poolId);
    expect(owner).to.be.equal(nftOwner.address);
  });

  it('should return success for isApproveOrOwner() - owner == sender', async function () {
    const { stakingNFT } = this;
    const [operator, nftOwner] = this.accounts.members;
    await stakingNFT.connect(this.stakingPoolSigner).mint(this.poolId, nftOwner.address);
    expect(await stakingNFT.isApprovedOrOwner(nftOwner.address, 0)).to.be.equal(true);
    expect(await stakingNFT.isApprovedOrOwner(operator.address, 0)).to.be.equal(false);
  });
});
