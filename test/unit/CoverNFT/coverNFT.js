const { ethers } = require('ethers');
const { expect } = require('chai');
const setup = require('./setup');
const { AddressZero } = ethers.constants;
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

describe('CoverNFT', function () {
  it('should verify that constructor variables were set correctly', async function () {
    const fixture = await loadFixture(setup);
    const { coverNFT } = fixture;
    expect(await coverNFT.name()).to.be.eq('NexusMutual Cover');
    expect(await coverNFT.symbol()).to.be.eq('NXMC');
  });

  it('should revert when calling tokenURI without a coverBuy', async function () {
    const fixture = await loadFixture(setup);
    const { coverNFT } = fixture;
    const [operator, nftOwner] = fixture.accounts.members;
    await coverNFT.connect(operator).mint(nftOwner.address);
    await expect(coverNFT.tokenURI(0)).to.be.revertedWithCustomError(coverNFT, 'NotMinted');
  });

  it('should fail to mint - onlyOperator()', async function () {
    const fixture = await loadFixture(setup);
    const { coverNFT } = fixture;
    await expect(coverNFT.mint(coverNFT.address)).to.be.revertedWithCustomError(coverNFT, 'NotOperator');
  });

  it('should successfully mint', async function () {
    const fixture = await loadFixture(setup);
    const { coverNFT } = fixture;
    const [operator, nftOwner] = fixture.accounts.members;
    await coverNFT.connect(operator).mint(nftOwner.address);
    expect(await coverNFT.ownerOf(1)).to.be.equal(nftOwner.address);
  });

  it('should return success for isApproveOrOwner() - owner == sender', async function () {
    const fixture = await loadFixture(setup);
    const { coverNFT } = fixture;
    const [operator, nftOwner] = fixture.accounts.members;
    await coverNFT.connect(operator).mint(nftOwner.address);
    expect(await coverNFT.isApprovedOrOwner(nftOwner.address, 1)).to.be.equal(true);
    expect(await coverNFT.isApprovedOrOwner(operator.address, 1)).to.be.equal(false);
  });

  it('should return success for isApproveOrOwner() - isApprovedForAll', async function () {
    const fixture = await loadFixture(setup);
    const { coverNFT } = fixture;
    const [operator, nftOwner] = fixture.accounts.members;
    const [randomAccount] = fixture.accounts.generalPurpose;
    await coverNFT.connect(operator).mint(nftOwner.address);
    await coverNFT.connect(nftOwner).setApprovalForAll(randomAccount.address, true);
    expect(await coverNFT.isApprovedOrOwner(randomAccount.address, 1)).to.be.equal(true);
    expect(await coverNFT.isApprovedOrOwner(nftOwner.address, 1)).to.be.equal(true);
  });

  it('should return success for isApproveOrOwner() - isApproved', async function () {
    const fixture = await loadFixture(setup);
    const { coverNFT } = fixture;
    const [operator, nftOwner] = fixture.accounts.members;
    const [randomAccount] = fixture.accounts.generalPurpose;
    await coverNFT.connect(operator).mint(nftOwner.address);
    await coverNFT.connect(nftOwner).approve(randomAccount.address, 1);
    expect(await coverNFT.isApprovedOrOwner(randomAccount.address, 1)).to.be.equal(true);
    expect(await coverNFT.isApprovedOrOwner(nftOwner.address, 1)).to.be.equal(true);
  });

  it('should revert when calling isApproveOrOwner() for non-existing tokenId', async function () {
    const fixture = await loadFixture(setup);
    const { coverNFT } = fixture;
    const [, account] = fixture.accounts.members;
    await expect(coverNFT.isApprovedOrOwner(account.address, 1)).to.be.revertedWithCustomError(coverNFT, 'NotMinted');
  });

  it('should revert if caller is not operator', async function () {
    const fixture = await loadFixture(setup);
    const { coverNFT } = fixture;
    const [, notOperator] = fixture.accounts.members;
    await expect(coverNFT.connect(notOperator).changeOperator(notOperator.address)).to.be.revertedWithCustomError(
      coverNFT,
      'NotOperator',
    );
  });

  it('should revert if new operator is address zero', async function () {
    const fixture = await loadFixture(setup);
    const { coverNFT } = fixture;
    const [operator] = fixture.accounts.members;
    await expect(coverNFT.connect(operator).changeOperator(AddressZero)).to.be.revertedWithCustomError(
      coverNFT,
      'InvalidNewOperatorAddress',
    );
  });

  it('should set the new operator address', async function () {
    const fixture = await loadFixture(setup);
    const { coverNFT } = fixture;
    const [oldOperator, newOperator] = fixture.accounts.members;
    expect(await coverNFT.operator()).to.not.be.equal(newOperator.address);
    await coverNFT.connect(oldOperator).changeOperator(newOperator.address);
    expect(await coverNFT.operator()).to.be.equal(newOperator.address);
  });

  it('should revert if changing nft descriptor from non operator account', async function () {
    const fixture = await loadFixture(setup);
    const { coverNFT } = fixture;
    const [, notOperator] = fixture.accounts.members;
    await expect(coverNFT.connect(notOperator).changeNFTDescriptor(notOperator.address)).to.be.revertedWithCustomError(
      coverNFT,
      'NotOperator',
    );
  });

  it('should revert if new nft descriptor address is zero', async function () {
    const fixture = await loadFixture(setup);
    const { coverNFT } = fixture;
    const [operator] = fixture.accounts.members;
    await expect(coverNFT.connect(operator).changeNFTDescriptor(AddressZero)).to.be.revertedWithCustomError(
      coverNFT,
      'InvalidNewNFTDescriptorAddress',
    );
  });

  it('should successfully change nft descriptor address', async function () {
    const fixture = await loadFixture(setup);
    const { coverNFT } = fixture;
    const [operator, newNFTDescriptor] = fixture.accounts.members;
    expect(await coverNFT.nftDescriptor()).to.not.be.equal(newNFTDescriptor.address);
    await coverNFT.connect(operator).changeNFTDescriptor(newNFTDescriptor.address);
    expect(await coverNFT.nftDescriptor()).to.be.equal(newNFTDescriptor.address);
  });

  it('should increment totalSupply', async function () {
    const fixture = await loadFixture(setup);
    const { coverNFT } = fixture;
    const [operator, nftOwner] = fixture.accounts.members;
    const tokenId = 1;

    expect(await coverNFT.totalSupply()).to.be.equal(0);
    await expect(coverNFT.connect(operator).mint(nftOwner.address))
      .to.emit(coverNFT, 'Transfer')
      .withArgs(AddressZero, nftOwner.address, tokenId);

    expect(await coverNFT.totalSupply()).to.be.equal(1);
  });
});
