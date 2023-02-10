const { ethers } = require('ethers');
const { expect } = require('chai');
const { AddressZero } = ethers.constants;

describe('CoverNFT', function () {
  it('should verify that constructor variables were set correctly', async function () {
    const { coverNFT } = this;
    expect(await coverNFT.name()).to.be.eq('NexusMutual Cover');
    expect(await coverNFT.symbol()).to.be.eq('NXMC');
  });

  it.skip('should return tokenURI', async function () {
    const { coverNFT } = this;
    expect(await coverNFT.tokenURI(0)).to.be.eq('');
  });

  it('should fail to mint - onlyOperator()', async function () {
    const { coverNFT } = this;
    await expect(coverNFT.mint(coverNFT.address)).to.be.revertedWithCustomError(coverNFT, 'NotOperator');
  });

  it('should successfully mint', async function () {
    const { coverNFT } = this;
    const [operator, nftOwner] = this.accounts.members;
    await coverNFT.connect(operator).mint(nftOwner.address);
    expect(await coverNFT.ownerOf(1)).to.be.equal(nftOwner.address);
  });

  it('should return success for isApproveOrOwner() - owner == sender', async function () {
    const { coverNFT } = this;
    const [operator, nftOwner] = this.accounts.members;
    await coverNFT.connect(operator).mint(nftOwner.address);
    expect(await coverNFT.isApprovedOrOwner(nftOwner.address, 1)).to.be.equal(true);
    expect(await coverNFT.isApprovedOrOwner(operator.address, 1)).to.be.equal(false);
  });

  it('should return success for isApproveOrOwner() - isApprovedForAll', async function () {
    const { coverNFT } = this;
    const [operator, nftOwner] = this.accounts.members;
    const [randomAccount] = this.accounts.generalPurpose;
    await coverNFT.connect(operator).mint(nftOwner.address);
    await coverNFT.connect(nftOwner).setApprovalForAll(randomAccount.address, true);
    expect(await coverNFT.isApprovedOrOwner(randomAccount.address, 1)).to.be.equal(true);
    expect(await coverNFT.isApprovedOrOwner(nftOwner.address, 1)).to.be.equal(true);
  });

  it('should return success for isApproveOrOwner() - isApproved', async function () {
    const { coverNFT } = this;
    const [operator, nftOwner] = this.accounts.members;
    const [randomAccount] = this.accounts.generalPurpose;
    await coverNFT.connect(operator).mint(nftOwner.address);
    await coverNFT.connect(nftOwner).approve(randomAccount.address, 1);
    expect(await coverNFT.isApprovedOrOwner(randomAccount.address, 1)).to.be.equal(true);
    expect(await coverNFT.isApprovedOrOwner(nftOwner.address, 1)).to.be.equal(true);
  });

  it('should revert when calling isApproveOrOwner() for non-existing tokenId', async function () {
    const { coverNFT } = this;
    const [, account] = this.accounts.members;
    await expect(coverNFT.isApprovedOrOwner(account.address, 1)).to.be.revertedWithCustomError(coverNFT, 'NotMinted');
  });

  it('should revert if caller is not operator', async function () {
    const { coverNFT } = this;
    const [, notOperator] = this.accounts.members;
    await expect(coverNFT.connect(notOperator).changeOperator(notOperator.address)).to.be.revertedWithCustomError(
      coverNFT,
      'NotOperator',
    );
  });

  it('should revert if new operator is address zero', async function () {
    const { coverNFT } = this;
    const [operator] = this.accounts.members;
    await expect(coverNFT.connect(operator).changeOperator(AddressZero)).to.be.revertedWithCustomError(
      coverNFT,
      'InvalidNewOperatorAddress',
    );
  });

  it('should set the new operator address', async function () {
    const { coverNFT } = this;
    const [oldOperator, newOperator] = this.accounts.members;
    expect(await coverNFT.operator()).to.not.be.equal(newOperator.address);
    await coverNFT.connect(oldOperator).changeOperator(newOperator.address);
    expect(await coverNFT.operator()).to.be.equal(newOperator.address);
  });

  it('should increment totalSupply', async function () {
    const { coverNFT } = this;
    const [operator, nftOwner] = this.accounts.members;
    const tokenId = 1;

    expect(await coverNFT.totalSupply()).to.be.equal(0);
    await expect(coverNFT.connect(operator).mint(nftOwner.address))
      .to.emit(coverNFT, 'Transfer')
      .withArgs(AddressZero, nftOwner.address, tokenId);

    expect(await coverNFT.totalSupply()).to.be.equal(1);
  });
});
