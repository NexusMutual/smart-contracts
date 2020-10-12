const { defaultSender } = require('@openzeppelin/test-environment');
const BN = require('bn.js');
const { assert } = require('chai');

describe('addProof', function () {

  it('should emit an event with cid, ipfsHash and sender when called', async function () {

    const { claimProofs } = this;

    const cid = new BN(1);
    const ipfsHash = 'mockedIpfsHash';
    const res = await claimProofs.addProof(cid, ipfsHash);
    const proofAddedLog = res.logs.find(x => x.event === 'ProofAdded');
    assert(proofAddedLog !== undefined, 'Expected a ProofAdded event');
    assert(proofAddedLog.args[0].eq(cid), `Expected ProofAdded event first argument to be ${cid}`);
    assert(proofAddedLog.args[1] === defaultSender, `Expected ProofAdded event first argument to be ${defaultSender}`);
    assert(proofAddedLog.args[2] === ipfsHash, `Expected ProofAdded event first argument to be ${ipfsHash}`);

  });

});
