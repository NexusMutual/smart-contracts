const { ethers } = require('hardhat');
const { expect } = require('chai');
const { setEtherBalance } = require('../../utils/evm');
const { toBytes } = require('../../../lib/helpers');
const { BigNumber } = ethers;

describe('StakingNFT', function () {
  // impersonate staking pool address
  before(async function () {
    const { cover } = this;
    const poolId = 50;
    const stakingAddress = await cover.stakingPool(poolId);
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

  it('should revert when reading tokenInfo for a non-existent token', async function () {
    const { stakingNFT } = this;
    await expect(stakingNFT.tokenInfo(0)).to.be.revertedWith('NOT_MINTED');
  });

  it('should revert if calling stakingPoolOf for a non existent token', async function () {
    const { stakingNFT } = this;
    await expect(stakingNFT.stakingPoolOf(0)).to.be.revertedWith('NOT_MINTED');
  });

  it('should fail to mint to zero address', async function () {
    const { stakingNFT } = this;
    await expect(
      stakingNFT.connect(this.stakingPoolSigner).mint(this.poolId, ethers.constants.AddressZero),
    ).to.be.revertedWith('INVALID_RECIPIENT');
  });

  it('should fail to mint - OnlyStakingPool()', async function () {
    const { stakingNFT } = this;
    const [member] = this.accounts.members;
    await expect(stakingNFT.connect(member).mint(this.poolId, member.address)).to.be.revertedWith('NOT_STAKING_POOL');
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
    const [owner, nonOwner] = this.accounts.members;
    await stakingNFT.connect(this.stakingPoolSigner).mint(this.poolId, owner.address);
    expect(await stakingNFT.isApprovedOrOwner(owner.address, 0)).to.be.equal(true);
    expect(await stakingNFT.isApprovedOrOwner(nonOwner.address, 0)).to.be.equal(false);
  });

  it('should revert when msg.sender is not the owner of the token - NOT_AUTHORIZED', async function () {
    const { stakingNFT } = this;
    const [owner, nonOwner] = this.accounts.members;
    await stakingNFT.connect(this.stakingPoolSigner).mint(this.poolId, owner.address);
    await expect(
      stakingNFT.connect(nonOwner).approve(nonOwner.address, 0 /* TODO: change to 1 when 0 is flag for new token */),
    ).to.be.revertedWith('NOT_AUTHORIZED');
  });

  it('should revert if reading balance of 0 address - ZERO_ADDRESS', async function () {
    const { stakingNFT } = this;
    await expect(stakingNFT.balanceOf(ethers.constants.AddressZero)).to.be.revertedWith('ZERO_ADDRESS');
  });

  it('should revert if a non operator tries to call operatorTransfer - NOT_OPERATOR', async function () {
    const { stakingNFT } = this;
    const [member] = this.accounts.members;
    await stakingNFT.connect(this.stakingPoolSigner).mint(this.poolId, member.address);
    await expect(stakingNFT.operatorTransferFrom(member.address, member.address, 0)).to.be.revertedWith('NOT_OPERATOR');
  });

  it('should revert if trying to operatorTransfer a token from a non-owner - WRONG_FROM', async function () {
    const { stakingNFT, cover } = this;
    const [nonOwner, owner] = this.accounts.members;
    await stakingNFT.connect(this.stakingPoolSigner).mint(this.poolId, owner.address);
    await expect(cover.operatorTransferFrom(nonOwner.address, owner.address, 0)).to.be.revertedWith('WRONG_FROM');
  });

  it('should revert if trying to operatorTransfer a token to a zero address - ZERO_ADDRESS', async function () {
    const { stakingNFT, cover } = this;
    const [owner] = this.accounts.members;
    await stakingNFT.connect(this.stakingPoolSigner).mint(this.poolId, owner.address);
    await expect(cover.operatorTransferFrom(owner.address, ethers.constants.AddressZero, 0)).to.be.revertedWith(
      'INVALID_RECIPIENT',
    );
  });

  it('should revert if trying to transferFrom a token from a non-owner - WRONG_FROM', async function () {
    const { stakingNFT } = this;
    const [nonOwner, owner] = this.accounts.members;
    await stakingNFT.connect(this.stakingPoolSigner).mint(this.poolId, owner.address);
    await expect(stakingNFT.transferFrom(nonOwner.address, owner.address, 0)).to.be.revertedWith('WRONG_FROM');
  });

  it('should revert if trying to transferFrom a token to a zero address - ZERO_ADDRESS', async function () {
    const { stakingNFT } = this;
    const [owner] = this.accounts.members;
    await stakingNFT.connect(this.stakingPoolSigner).mint(this.poolId, owner.address);
    await expect(stakingNFT.transferFrom(owner.address, ethers.constants.AddressZero, 0)).to.be.revertedWith(
      'INVALID_RECIPIENT',
    );
  });

  it('should revert if not approved to transferFrom a token - NOT_AUTHORIZED', async function () {
    const { stakingNFT } = this;
    const [owner, nonOwner] = this.accounts.members;
    await stakingNFT.connect(this.stakingPoolSigner).mint(this.poolId, owner.address);
    await expect(stakingNFT.connect(nonOwner).transferFrom(owner.address, nonOwner.address, 0)).to.be.revertedWith(
      'NOT_AUTHORIZED',
    );
  });

  it('should transferFrom a token', async function () {
    const { stakingNFT } = this;
    const [owner, nonOwner] = this.accounts.members;
    await stakingNFT.connect(this.stakingPoolSigner).mint(this.poolId, owner.address);
    await stakingNFT.connect(owner).approve(nonOwner.address, 0);
    await stakingNFT.connect(nonOwner).transferFrom(owner.address, nonOwner.address, 0);
    expect(await stakingNFT.ownerOf(0)).to.be.equal(nonOwner.address);
  });

  it('should fail to safeTransfer with bytes to a contract without onERC721Received function', async function () {
    const { stakingNFT, cover } = this;
    const [owner] = this.accounts.members;
    await stakingNFT.connect(this.stakingPoolSigner).mint(this.poolId, owner.address);
    // Reverts without reason if the contract does not implement onERC721Received
    await expect(
      stakingNFT
        .connect(owner)
        ['safeTransferFrom(address,address,uint256,bytes)'](
          owner.address,
          cover.address,
          BigNumber.from(0),
          toBytes('cafe'),
        ),
    ).to.be.revertedWithoutReason();
  });

  it('should fail to safeTransfer to a contract that does not implement onERC721Received', async function () {
    const { stakingNFT, cover } = this;
    const [owner] = this.accounts.members;
    await stakingNFT.connect(this.stakingPoolSigner).mint(this.poolId, owner.address);
    // Reverts without reason if the contract does not implement onERC721Received
    await expect(
      stakingNFT
        .connect(owner)
        ['safeTransferFrom(address,address,uint256)'](owner.address, cover.address, BigNumber.from(0)),
    ).to.be.revertedWithoutReason();
  });

  it('should support erc721 and ERC165 interfaces', async function () {
    const { stakingNFT } = this;
    // 0x80ac58cd // ERC165 Interface ID for ERC721
    expect(await stakingNFT.supportsInterface('0x80ac58cd')).to.be.equal(true);
    // 0x01ffc9a7 // ERC165 Interface ID for ERC165
    expect(await stakingNFT.supportsInterface('0x01ffc9a7')).to.be.equal(true);
    // 0x5b5e139f   // ERC165 Interface ID for ERC721Metadata
    expect(await stakingNFT.supportsInterface('0x5b5e139f')).to.be.equal(true);
    expect(await stakingNFT.supportsInterface('0xdeadbeef')).to.be.equal(false);
  });
});
