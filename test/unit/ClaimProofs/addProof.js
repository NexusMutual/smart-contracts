const { defaultSender } = require('@openzeppelin/test-environment');
const BN = require('bn.js');
const { assert } = require('chai');
const accounts = require('../utils').accounts;

const {
  nonMembers: [nonMember],
  members: [memberOne, memberTwo],
} = accounts;

describe('addProof', function () {

  it('should emit an event with coverId, ipfsHash and sender when called', async function () {

    const { claimProofs } = this;

    const coverId = new BN(1);
    const ipfsHash = 'mockedIpfsHash';
    const res = await claimProofs.addProof(coverId, ipfsHash);
    const proofAddedLog = res.logs.find(x => x.event === 'ProofAdded');
    assert(proofAddedLog !== undefined, 'Expected a ProofAdded event');
    assert(proofAddedLog.args[0].eq(coverId), `Expected ProofAdded event first argument to be ${coverId}`);
    assert(proofAddedLog.args[1] === defaultSender, `Expected ProofAdded event first argument to be ${defaultSender}`);
    assert(proofAddedLog.args[2] === ipfsHash, `Expected ProofAdded event first argument to be ${ipfsHash}`);

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
