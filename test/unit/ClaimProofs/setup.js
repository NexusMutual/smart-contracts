const { artifacts } = require('hardhat');

const ClaimProofs = artifacts.require('ClaimProofs');

async function setup () {
  this.claimProofs = await ClaimProofs.new();
}

module.exports = setup;
