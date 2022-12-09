const { ethers, network, run, tenderly } = require('hardhat');
// const { hex } = require('../../lib/helpers');
// const products = require('../v2-migration/output/migratableProducts.json');
// const proposalCategories = require('../../lib/proposal-categories');
// const fs = require('fs');
const fp = require('path');

const SOLIDITY_5 = [
  'NXMToken',
  'ERC20',
  'TestnetQuotationData',
  'DisposableMemberRoles',
  'LegacyClaimsData',
  'DisposableProposalCategory',
  'ProposalCategory',
  'DisposableGovernance',
  'Governance',
  'DisposableGateway',
  'ProposalCategory',
  'Governance',
];

async function main() {
  const path = fp.resolve('/home/miljan/Downloads/Telegram Desktop/contractList.json');
  const contractList = require(path);
  for (let i = 0; i < contractList.length; i += 1) {
    await tenderly.verify(contractList[i]);
  }
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('An unexpected error encountered:', error);
      process.exit(1);
    });
}

module.exports = main;
