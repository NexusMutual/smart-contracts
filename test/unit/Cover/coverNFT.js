const { ethers } = require('ethers');
const { expect } = require('chai');
const { expectRevert } = require('@openzeppelin/test-helpers');
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
    await expectRevert(coverNFT.mint(coverNFT.address, 10), 'CoverNFT: Not operator');
  });

  it('should successfully mint', async function () {
    const { coverNFT } = this;
    const {
      members: [operator, nftOwner],
    } = this.accounts;
    await coverNFT.setMockOperator(operator.address);
    await coverNFT.connect(operator).mint(nftOwner.address, 0);
    expect(await coverNFT.ownerOf(0)).to.be.equal(nftOwner.address);
  });

  it('should fail to burn - onlyOperator()', async function () {
    const { coverNFT } = this;
    await expectRevert(coverNFT.burn(0), 'CoverNFT: Not operator');
  });

  it('should successfully burn', async function () {
    const { coverNFT } = this;
    const {
      members: [operator, nftOwner],
    } = this.accounts;
    await coverNFT.setMockOperator(operator.address);
    await coverNFT.connect(operator).mint(nftOwner.address, 0);
    await coverNFT.connect(operator).burn(0);
    await expectRevert(coverNFT.ownerOf(0), 'NOT_MINTED');
  });

  it('should return success for isApproveOrOwner() - owner == sender', async function () {
    const { coverNFT } = this;
    const {
      members: [operator, nftOwner],
    } = this.accounts;
    await coverNFT.setMockOperator(operator.address);
    await coverNFT.connect(operator).mint(nftOwner.address, 0);
    expect(await coverNFT.isApprovedOrOwner(nftOwner.address, 0)).to.be.equal(true);
    expect(await coverNFT.isApprovedOrOwner(operator.address, 0)).to.be.equal(false);
  });

  it('should return success for isApproveOrOwner() - isApprovedForAll', async function () {
    const { coverNFT } = this;
    const {
      members: [operator, nftOwner],
      generalPurpose: [randomAccount],
    } = this.accounts;
    await coverNFT.setMockOperator(operator.address);
    await coverNFT.connect(operator).mint(nftOwner.address, 0);
    await coverNFT.connect(nftOwner).setApprovalForAll(randomAccount.address, true);
    expect(await coverNFT.isApprovedOrOwner(randomAccount.address, 0)).to.be.equal(true);
    expect(await coverNFT.isApprovedOrOwner(nftOwner.address, 0)).to.be.equal(true);
  });

  it('should return success for isApproveOrOwner() - isApproved', async function () {
    const { coverNFT } = this;
    const {
      members: [operator, nftOwner],
      generalPurpose: [randomAccount],
    } = this.accounts;
    await coverNFT.setMockOperator(operator.address);
    await coverNFT.connect(operator).mint(nftOwner.address, 0);
    await coverNFT.connect(nftOwner).approve(randomAccount.address, 0);
    expect(await coverNFT.isApprovedOrOwner(randomAccount.address, 0)).to.be.equal(true);
    expect(await coverNFT.isApprovedOrOwner(nftOwner.address, 0)).to.be.equal(true);
  });

  it('should revert when calling isApproveOrOwner() for non-existing tokenId', async function () {
    const { coverNFT } = this;
    const {
      members: [account],
    } = this.accounts;
    await expectRevert(coverNFT.isApprovedOrOwner(account.address, 0), 'NOT_MINTED');
  });

  it('should fail to transfer from operator - onlyOperator()', async function () {
    const { coverNFT } = this;
    const {
      members: [account],
    } = this.accounts;
    await expectRevert(coverNFT.operatorTransferFrom(coverNFT.address, account.address, 0), 'CoverNFT: Not operator');
  });

  it('should fail to transfer from operator - wrong from address', async function () {
    const { coverNFT } = this;
    const {
      members: [operator, nftOwner, otherAddress],
    } = this.accounts;
    await coverNFT.setMockOperator(operator.address);
    await coverNFT.connect(operator).mint(nftOwner.address, 0);
    await expectRevert(
      coverNFT.connect(operator).operatorTransferFrom(otherAddress.address, operator.address, 0),
      'WRONG_FROM',
    );
  });

  it('should fail to transfer from operator - send to 0 address', async function () {
    const { coverNFT } = this;
    const {
      members: [operator, nftOwner],
    } = this.accounts;
    await coverNFT.setMockOperator(operator.address);
    await coverNFT.connect(operator).mint(nftOwner.address, 0);
    await expectRevert(
      coverNFT.connect(operator).operatorTransferFrom(nftOwner.address, AddressZero, 0),
      'INVALID_RECIPIENT',
    );
  });

  it('should successfully transfer from the operator', async function () {
    const { coverNFT } = this;
    const {
      members: [operator, coverNFTReceiver],
    } = this.accounts;
    await coverNFT.setMockOperator(operator.address);
    await coverNFT.connect(operator).mint(coverNFTReceiver.address, 0);
    await coverNFT.connect(operator).operatorTransferFrom(coverNFTReceiver.address, operator.address, 0);
    expect(await coverNFT.ownerOf(0)).to.be.equal(operator.address);
  });

  it('should revert if caller is not operator', async function () {
    const { coverNFT } = this;
    const {
      members: [oldOperator, newOperator],
    } = this.accounts;
    await coverNFT.setMockOperator(oldOperator.address);
    await expectRevert(coverNFT.connect(newOperator).changeOperator(newOperator.address), 'CoverNFT: Not operator');
  });

  it('should revert if new operator is address zero', async function () {
    const { coverNFT } = this;
    const {
      members: [operator],
    } = this.accounts;
    await coverNFT.setMockOperator(operator.address);
    await expectRevert(coverNFT.connect(operator).changeOperator(AddressZero), 'CoverNFT: Invalid newOperator address');
  });

  it('should set the new operator address', async function () {
    const { coverNFT } = this;
    const {
      members: [oldOperator, newOperator],
    } = this.accounts;

    await coverNFT.setMockOperator(oldOperator.address);

    expect(await coverNFT.operator()).to.not.be.equal(newOperator.address);
    await coverNFT.connect(oldOperator).changeOperator(newOperator.address);
    expect(await coverNFT.operator()).to.be.equal(newOperator.address);
  });
});
