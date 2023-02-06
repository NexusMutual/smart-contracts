const { ethers } = require('ethers');
const { expect } = require('chai');
const { AddressZero } = ethers.constants;

describe('CoverNFT', function () {
  it('should verify that constructor variables were set correctly', async function () {
    const { coverNFT } = this;
    expect(await coverNFT.name()).to.be.eq('NexusMutual Cover');
    expect(await coverNFT.symbol()).to.be.eq('NXMC');
  });

  it('should return tokenURI', async function () {
    const { coverNFT } = this;
    expect(await coverNFT.tokenURI(0)).to.be.eq('');
  });

  it('should fail to mint - onlyOperator()', async function () {
    const { coverNFT } = this;
    await expect(coverNFT.mint(coverNFT.address)).to.be.revertedWith('CoverNFT: Not operator');
  });

  it('should successfully mint', async function () {
    const { coverNFT } = this;
    const [operator, nftOwner] = this.accounts.members;
    await coverNFT.connect(operator).mint(nftOwner.address);
    expect(await coverNFT.ownerOf(1)).to.be.equal(nftOwner.address);
  });

  it('should fail to burn - onlyOperator()', async function () {
    const { coverNFT } = this;
    await expect(coverNFT.burn(1)).to.be.revertedWith('CoverNFT: Not operator');
  });

  it('should successfully burn', async function () {
    const { coverNFT } = this;
    const [operator, nftOwner] = this.accounts.members;
    await coverNFT.connect(operator).mint(nftOwner.address);
    await coverNFT.connect(operator).burn(1);
    await expect(coverNFT.ownerOf(1)).to.be.revertedWith('NOT_MINTED');
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
    await expect(coverNFT.isApprovedOrOwner(account.address, 1)).to.be.revertedWith('NOT_MINTED');
  });

  it('should fail to transfer from operator - onlyOperator()', async function () {
    const { coverNFT } = this;
    const [account] = this.accounts.members;
    await expect(coverNFT.operatorTransferFrom(coverNFT.address, account.address, 1)).to.be.revertedWith(
      'CoverNFT: Not operator',
    );
  });

  it('should fail to transfer from operator - wrong from address', async function () {
    const { coverNFT } = this;
    const [operator, nftOwner, otherAddress] = this.accounts.members;
    await coverNFT.connect(operator).mint(nftOwner.address);
    await expect(
      coverNFT.connect(operator).operatorTransferFrom(otherAddress.address, operator.address, 1),
    ).to.be.revertedWith('WRONG_FROM');
  });

  it('should fail to transfer from operator - send to 0 address', async function () {
    const { coverNFT } = this;
    const [operator, nftOwner] = this.accounts.members;
    await coverNFT.connect(operator).mint(nftOwner.address);
    await expect(coverNFT.connect(operator).operatorTransferFrom(nftOwner.address, AddressZero, 1)).to.be.revertedWith(
      'INVALID_RECIPIENT',
    );
  });

  it('should successfully transfer from the operator', async function () {
    const { coverNFT } = this;
    const [operator, coverNFTReceiver] = this.accounts.members;
    await coverNFT.connect(operator).mint(coverNFTReceiver.address);
    await coverNFT.connect(operator).operatorTransferFrom(coverNFTReceiver.address, operator.address, 1);
    expect(await coverNFT.ownerOf(1)).to.be.equal(operator.address);
  });

  it('should revert if caller is not operator', async function () {
    const { coverNFT } = this;
    const [, notOperator] = this.accounts.members;
    await expect(coverNFT.connect(notOperator).changeOperator(notOperator.address)).to.be.revertedWith(
      'CoverNFT: Not operator',
    );
  });

  it('should revert if new operator is address zero', async function () {
    const { coverNFT } = this;
    const [operator] = this.accounts.members;
    await expect(coverNFT.connect(operator).changeOperator(AddressZero)).to.be.revertedWith(
      'CoverNFT: Invalid newOperator address',
    );
  });

  it('should set the new operator address', async function () {
    const { coverNFT } = this;
    const [oldOperator, newOperator] = this.accounts.members;
    expect(await coverNFT.operator()).to.not.be.equal(newOperator.address);
    await coverNFT.connect(oldOperator).changeOperator(newOperator.address);
    expect(await coverNFT.operator()).to.be.equal(newOperator.address);
  });

  it('should increment and decrement totalSupply', async function () {
    const { coverNFT } = this;
    const [operator, nftOwner] = this.accounts.members;
    const tokenId = 1;

    expect(await coverNFT.totalSupply()).to.be.equal(0);
    await expect(coverNFT.connect(operator).mint(nftOwner.address))
      .to.emit(coverNFT, 'Transfer')
      .withArgs(AddressZero, nftOwner.address, tokenId);

    expect(await coverNFT.totalSupply()).to.be.equal(1);
    await coverNFT.connect(operator).burn(tokenId);
  });
});
