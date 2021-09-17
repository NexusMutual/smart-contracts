const { ethers } = require('hardhat');
const { time } = require('@openzeppelin/test-helpers');
const { assert, expect } = require('chai');

const { submitClaim, daysToSeconds, ASSET } = require('./helpers');

const { parseEther } = ethers.utils;

describe.only('submitClaim', function () {
  it('reverts if the submission deposit is not sent', async function () {
    assert(false, '[todo]');
  });

  it('refunds any excess eth sent as a submission deposit', async function () {
    assert(false, '[todo]');
  });

  it('reverts if the requested amount exceeds cover amount', async function () {
    assert(false, '[todo]');
  });

  it('reverts if the cover starts in the future', async function () {
    assert(false, '[todo]');
  });

  it('reverts if the cover is outside the grace period', async function () {
    assert(false, '[todo]');
  });

  it('calls startAssessment and stores the returned assessmentId in the claim', async function () {
    assert(false, '[todo]');
  });

  it('reverts if called by non-member address', async function () {
    const { claims, cover } = this.contracts;
    const [coverOwner] = this.accounts.members;
    const [nonMemberOwner] = this.accounts.nonMembers;
    await cover.buyCover(
      coverOwner.address,
      0, // productId
      ASSET.ETH,
      parseEther('100'),
      daysToSeconds(30),
      parseEther('2.6'),
      [],
    );
    const coverId = 0;
    cover.connect(coverOwner).transferFrom(coverOwner.address, nonMemberOwner.address, coverId);
    await cover.connect(nonMemberOwner).approve(claims.address, 0);
    expect(submitClaim(this)({ coverId, sender: nonMemberOwner })).to.be.reverted;
  });

  it('reverts if it is not called by cover owner ', async function () {
    const { claims, cover } = this.contracts;
    const [coverOwner] = this.accounts.members;
    await cover.buyCover(
      coverOwner.address,
      0, // productId
      ASSET.ETH,
      parseEther('100'),
      daysToSeconds(30),
      parseEther('2.6'),
      [],
    );
    const coverId = 0;
    await cover.connect(coverOwner).approve(claims.address, 0);
    expect(submitClaim(this)({ coverId, sender: coverOwner })).to.be.reverted;
  });

  it('emits ProofSubmitted event with the provided ipfsProofHash when it is not empty string', async function () {
    const { claims, cover } = this.contracts;
    const ipfsProofHash = 'ipfsProofHashMock';
    const [coverOwner] = this.accounts.members;
    await cover.buyCover(
      coverOwner.address,
      0, // productId
      ASSET.ETH,
      parseEther('100'),
      daysToSeconds(30),
      parseEther('2.6'),
      [],
    );
    const coverId = 0;
    await cover.connect(coverOwner).approve(claims.address, coverId);
    await expect(submitClaim(this)({ coverId, ipfsProofHash, sender: coverOwner }))
      .to.emit(claims, 'ProofSubmitted')
      .withArgs(0, coverOwner.address, ipfsProofHash);
  });

  it("doesn't emit ProofSubmitted event if ipfsProofHash is an empty string", async function () {
    const { claims, cover } = this.contracts;
    const [coverOwner] = this.accounts.members;
    await cover.buyCover(
      coverOwner.address,
      0, // productId
      ASSET.ETH,
      parseEther('100'),
      daysToSeconds(30),
      parseEther('2.6'),
      [],
    );
    const coverId = 0;
    await cover.connect(coverOwner).approve(claims.address, coverId);
    await expect(submitClaim(this)({ coverId, sender: coverOwner }))
      .not.to.emit(claims, 'ProofSubmitted')
      .withArgs(0, coverOwner.address);
  });

  it('transfers the cover NFT to the Claims contract', async function () {
    const { claims, cover } = this.contracts;
    const [coverOwner] = this.accounts.members;
    await cover.buyCover(
      coverOwner.address,
      0, // productId
      ASSET.ETH,
      parseEther('100'),
      daysToSeconds(30),
      parseEther('2.6'),
      [],
    );
    await cover.connect(coverOwner).approve(claims.address, 0);
    const coverId = 0;
    await submitClaim(this)({ coverId, sender: coverOwner });
    const owner = await cover.ownerOf(coverId);
    assert.equal(owner, claims.address);
  });

  it('stores the claimant address to whom it might return the cover NFT afterwards', async function () {
    const { claims, cover } = this.contracts;
    const [coverOwner] = this.accounts.members;
    await cover.buyCover(
      coverOwner.address,
      0, // productId
      ASSET.ETH,
      parseEther('100'),
      daysToSeconds(30),
      parseEther('2.6'),
      [],
    );
    await cover.connect(coverOwner).approve(claims.address, 0);
    const coverId = 0;
    await submitClaim(this)({ coverId, sender: coverOwner });
    const claimant = await claims.claimants(0);
    assert.equal(claimant, coverOwner.address);
  });
});
