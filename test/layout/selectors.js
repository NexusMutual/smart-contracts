const { ethers } = require('hardhat');
const { expect } = require('chai');

const proxyContracts = [
  'NXMaster',
  'Governance',
  'MemberRoles',
  'ProposalCategory',
  'LegacyPooledStaking',
  'TokenController',
  'IndividualClaims',
  'YieldTokenIncidents',
  'Assessment',
  'Cover',
  'StakingProducts',
  'Ramm',
];

describe('Selector collisions', function () {
  it('compare selectors of proxy and upgradable contracts', async function () {
    // get proxy selectors
    const { interface: proxyInterface } = await ethers.getContractFactory('OwnedUpgradeabilityProxy');
    const protectedFunctions = ['proxyOwner', 'transferProxyOwnership', 'upgradeTo'];
    const protectedSelectors = protectedFunctions.map(fn => proxyInterface.getSighash(fn));

    // check it fails with a known collision
    const { interface: collidingInterface } = await ethers.getContractFactory('ProxySignatureCollider');

    const foundClashes = protectedSelectors.map(selector => {
      try {
        return collidingInterface.getFunction(selector);
      } catch (e) {
        return false;
      }
    });

    expect(foundClashes.filter(f => f !== false).length).to.equal(1);

    // make sure all protected selectors are not present in the proxy contracts
    for (const contract of proxyContracts) {
      const { interface: contractInterface } = await ethers.getContractFactory(contract);
      for (const signature of protectedSelectors) {
        expect(() => contractInterface.getFunction(signature)).to.throw('no matching function');
      }
    }
  });
});
