const { ethers } = require('hardhat');
const { expect } = require('chai');

describe('Functions layout', function () {
  it('compare selectors of proxy and upgradable contracts', async function () {
    // proxy contracts
    const contractsToCompare = [
      'NXMaster',
      'Governance',
      'MemberRoles',
      'ProposalCategory',
      'LegacyPooledStaking',
      'TokenController',
      'LegacyGateway',
      'IndividualClaims',
      'YieldTokenIncidents',
      'Assessment',
      'Cover',
      'CoverMigrator',
    ];
    const { interface: proxyInterface } = await ethers.getContractFactory('OwnedUpgradeabilityProxy');
    const selectorsToCompare = ['proxyOwner', 'transferProxyOwnership', 'upgradeTo'].map(func =>
      proxyInterface.getSighash(func),
    );

    for (const contract of contractsToCompare) {
      const { interface: contractInterface } = await ethers.getContractFactory(contract);
      for (const sigHash of selectorsToCompare) {
        expect(() => contractInterface.getFunction(sigHash)).to.throw(`no matching function`);
      }
    }
  });
});
