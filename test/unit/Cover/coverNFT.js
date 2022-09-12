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
    const { members } = this.accounts;
    await coverNFT.setMockOperator(members[0].address);
    await coverNFT.connect(members[0]).mint(members[1].address, 0);
    expect(await coverNFT.ownerOf(0)).to.be.equal(members[1].address);
  });
  it('should fail to burn - onlyOperator()', async function () {
    const { coverNFT } = this;
    await expectRevert(coverNFT.burn(0), 'CoverNFT: Not operator');
  });
  it('should successfully burn', async function () {
    const { coverNFT } = this;
    const { members } = this.accounts;
    await coverNFT.setMockOperator(members[0].address);
    await coverNFT.connect(members[0]).mint(members[1].address, 0);
    await coverNFT.connect(members[0]).burn(0);
    await expectRevert(coverNFT.ownerOf(0), 'NOT_MINTED');
  });
  it('should return success for isApproveOrOwner() - owner == sender', async function () {
    const { coverNFT } = this;
    const { members } = this.accounts;
    await coverNFT.setMockOperator(members[0].address);
    await coverNFT.connect(members[0]).mint(members[1].address, 0);
    expect(await coverNFT.isApprovedOrOwner(members[1].address, 0)).to.be.equal(true);
    expect(await coverNFT.isApprovedOrOwner(members[0].address, 0)).to.be.equal(false);
  });
  it('should return success for isApproveOrOwner() - isApprovedForAll', async function () {
    const { coverNFT } = this;
    const { members } = this.accounts;
    await coverNFT.setMockOperator(members[0].address);
    await coverNFT.connect(members[0]).mint(members[1].address, 0);
    await coverNFT.connect(members[1]).setApprovalForAll(members[0].address, true);
    expect(await coverNFT.isApprovedOrOwner(members[0].address, 0)).to.be.equal(true);
    expect(await coverNFT.isApprovedOrOwner(members[1].address, 0)).to.be.equal(true);
  });
  it('should return success for isApproveOrOwner() - isApproved', async function () {
    const { coverNFT } = this;
    const { members } = this.accounts;
    await coverNFT.setMockOperator(members[0].address);
    await coverNFT.connect(members[0]).mint(members[1].address, 0);
    await coverNFT.connect(members[1]).approve(members[0].address, 0);
    expect(await coverNFT.isApprovedOrOwner(members[0].address, 0)).to.be.equal(true);
    expect(await coverNFT.isApprovedOrOwner(members[1].address, 0)).to.be.equal(true);
  });
  it('should revert when calling isApproveOrOwner() for non-existing tokenId', async function () {
    const { coverNFT } = this;
    const { members } = this.accounts;
    await expectRevert(coverNFT.isApprovedOrOwner(members[0].address, 0), 'NOT_MINTED');
  });
  it('should fail to transfer from operator - onlyOperator()', async function () {
    const { coverNFT } = this;
    const { members } = this.accounts;
    await expectRevert(
      coverNFT.operatorTransferFrom(coverNFT.address, members[0].address, 0),
      'CoverNFT: Not operator',
    );
  });
  it('should fail to transfer from operator - wrong from address', async function () {
    const { coverNFT } = this;
    const { members } = this.accounts;
    await coverNFT.setMockOperator(members[0].address);
    await coverNFT.connect(members[0]).mint(members[1].address, 0);
    await expectRevert(
      coverNFT.connect(members[0]).operatorTransferFrom(members[2].address, members[0].address, 0),
      'WRONG_FROM',
    );
  });
  it('should fail to transfer from operator - send to 0 address', async function () {
    const { coverNFT } = this;
    const { members } = this.accounts;
    await coverNFT.setMockOperator(members[0].address);
    await coverNFT.connect(members[0]).mint(members[1].address, 0);
    await expectRevert(
      coverNFT.connect(members[0]).operatorTransferFrom(members[1].address, AddressZero, 0),
      'INVALID_RECIPIENT',
    );
  });
  it('should successfully transfer from the operator', async function () {
    const { coverNFT } = this;
    const { members } = this.accounts;
    await coverNFT.setMockOperator(members[0].address);
    await coverNFT.connect(members[0]).mint(members[1].address, 0);
    await coverNFT.connect(members[0]).operatorTransferFrom(members[1].address, members[0].address, 0);
    expect(await coverNFT.ownerOf(0)).to.be.equal(members[0].address);
  });
});
