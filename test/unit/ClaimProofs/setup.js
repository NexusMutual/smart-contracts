const { contract } = require('@openzeppelin/test-environment');

const { hex } = require('../utils').helpers;

const MasterMock = contract.fromArtifact('CPMasterMock');
const QuotationDataMock = contract.fromArtifact('CPQuotationDataMock');
const ClaimProofs = contract.fromArtifact('ClaimProofs');

async function setup () {

  const master = await MasterMock.new();
  const quotationData = await QuotationDataMock.new();
  const claimProofs = await ClaimProofs.new(master.address);

  // set contract addresses
  await master.setLatestAddress(hex('QD'), quotationData.address);

  this.master = master;
  this.quotationData = quotationData;
  this.claimProofs = claimProofs;
}

module.exports = setup;
