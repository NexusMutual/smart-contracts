const { contract } = require('@openzeppelin/test-environment');

const ClaimProofs = contract.fromArtifact('ClaimProofs');

async function setup () {

  const claimProofs = await ClaimProofs.new();

  this.claimProofs = claimProofs;
}

module.exports = setup;
