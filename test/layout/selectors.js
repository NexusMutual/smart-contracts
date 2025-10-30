const { ethers } = require('hardhat');
const { expect } = require('chai');

const proxyContracts = [
  'Assessments',
  'Claims',
  'Cover',
  'CoverProducts',
  'Governor',
  'LegacyMemberRoles',
  'LimitOrders',
  'NXMaster',
  'Pool',
  'Ramm',
  'Registry',
  'SafeTracker',
  'StakingProducts',
  'SwapOperator',
  'TokenController',
];

describe('Selector collisions', function () {
  it('compare selectors of proxy and upgradable contracts', async function () {
    // get proxy selectors
    const { interface: proxyInterface } = await ethers.getContractFactory('UpgradeableProxy');
    const protectedFunctions = ['implementation', 'proxyOwner', 'transferProxyOwnership', 'upgradeTo'];
    const protectedSelectors = protectedFunctions.map(fn => proxyInterface.getFunction(fn).selector);

    // check it fails with a known collision
    const { interface: collidingInterface } = await ethers.getContractFactory('ProxySignatureCollider');

    const foundClashes = protectedSelectors.map(selector => {
      return collidingInterface.getFunction(selector) !== null;
    });

    expect(foundClashes.filter(f => f !== false).length).to.equal(1);

    // make sure all protected selectors are not present in the proxy contracts
    for (const contract of proxyContracts) {
      const { interface: contractInterface } = await ethers.getContractFactory(contract);
      for (const signature of protectedSelectors) {
        expect(contractInterface.getFunction(signature)).to.be.null;
      }
    }
  });
});
