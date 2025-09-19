const crypto = require('node:crypto');
const assert = require('node:assert');

const { setBalance } = require('@nomicfoundation/hardhat-network-helpers');
const { ethers, network } = require('hardhat');

const addresses = require('../../deployments/src/addresses.json');

const PROXY_ABI = [
  'function proxyOwner() public view returns (address owner)',
  'function upgradeTo(address newImplementation) public',
];

const main = async () => {
  console.log(`Starting patch script on ${network.name} network`);

  const registryProxy = await ethers.getContractAt(PROXY_ABI, addresses.Registry);

  console.log('Reading owner');
  const owner = await registryProxy.proxyOwner();

  console.log('Getting a signer');
  const [signer] = await ethers.getSigners();

  console.log('Deploying new implementation contract');
  const testnetRegistryImplementation = await ethers.deployContract(
    'TestnetRegistry',
    [addresses.Registry, addresses.NXMaster],
    signer,
  );

  console.log('Upgrading proxy');
  const ownerSigner = await ethers.getSigner(owner);
  await setBalance(owner, ethers.parseEther('10'));
  const upgradeTx = await registryProxy.connect(ownerSigner).upgradeTo(testnetRegistryImplementation.target);
  await upgradeTx.wait();
  console.log('Proxy upgraded');

  // test join function
  console.log('Test join');
  const testnetRegistry = await ethers.getContractAt('TestnetRegistry', addresses.Registry, signer);
  const dummySignature = '0x' + crypto.randomBytes(64).toString('hex');
  const joinTx = await testnetRegistry.join(signer.address, dummySignature, { value: ethers.parseEther('0.002') });
  await joinTx.wait();

  const isMember = await testnetRegistry.isMember(signer.address);
  assert(isMember, 'Signer is not a member');
  console.log('Successfully joined ✅');
};

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
