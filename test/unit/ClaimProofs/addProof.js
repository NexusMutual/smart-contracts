const { expectEvent } = require('@openzeppelin/test-helpers');
const BN = require('bn.js');
const { assert } = require('chai');
const accounts = require('../utils').accounts;

const {
  defaultSender,
  nonMembers: [nonMember],
  members: [memberOne, memberTwo],
} = accounts;

describe('addProof', function () {

  it('should emit an event with coverId, ipfsHash and sender when called', async function () {

    const { claimProofs } = this;

    const coverId = new BN(1);
    const ipfsHash = 'mockedIpfsHash';
    const tx = await claimProofs.addProof(coverId, ipfsHash);
    await expectEvent(tx, 'ProofAdded', {
      coverId: coverId,
      owner: defaultSender,
      ipfsHash,
    });
  });

  it('should allow anyone to submit a proof for the same coverId', async function () {

    const { claimProofs } = this;

    const coverId = new BN(1);
    const ipfsHash = 'mockedIpfsHash';
    assert(await claimProofs.addProof(coverId, ipfsHash, { from: memberOne }));
    assert(await claimProofs.addProof(coverId, ipfsHash, { from: nonMember }));
    assert(await claimProofs.addProof(coverId, ipfsHash, { from: memberTwo }));

  });

  it('should allow someone to submit a proof multiple times', async function () {

    const { claimProofs } = this;

    const coverId = new BN(1);
    const ipfsHash = 'mockedIpfsHash';
    assert(await claimProofs.addProof(coverId, ipfsHash, { from: nonMember }));
    assert(await claimProofs.addProof(coverId, ipfsHash, { from: nonMember }));

  });

});
