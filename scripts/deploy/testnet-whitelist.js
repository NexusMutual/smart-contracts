const crypto = require('node:crypto');
const assert = require('node:assert');

const { setBalance } = require('@nomicfoundation/hardhat-network-helpers');
const { ethers, network } = require('hardhat');

const { JsonRpcSigner, JsonRpcProvider } = ethers;

const addresses = require('../../deployments/src/addresses.json');

const PROXY_ABI = [
  'function proxyOwner() public view returns (address owner)',
  'function implementation() external view returns (address)',
  'function upgradeTo(address newImplementation) public',
];

const main = async () => {
  console.log(`Starting patch script on ${network.name} network`);

  const registryProxy = await ethers.getContractAt(PROXY_ABI, addresses.Registry);

  console.log('Deploying new implementation contract');
  const registryImplementation = await ethers.deployContract('TestnetRegistry', [
    addresses.Registry,
    addresses.NXMaster,
  ]);
  await registryImplementation.waitForDeployment();

  assert.notEqual(await registryProxy.implementation(), registryImplementation.target);

  console.log('Upgrading proxy');
  const owner = await registryProxy.proxyOwner();
  const provider = new JsonRpcProvider(network.config.url);
  const ownerSigner = new JsonRpcSigner(provider, owner);
  const upgradeTx = await registryProxy.connect(ownerSigner).upgradeTo(registryImplementation);
  await upgradeTx.wait();

  assert.equal(await registryProxy.implementation(), registryImplementation.target);
  console.log('Proxy upgraded');

  // test join function
  console.log('Test join');
  const [signer] = await ethers.getSigners();
  // const signer = new JsonRpcSigner(provider, addressToJoin) // for specific address
  const testnetRegistry = await ethers.getContractAt('TestnetRegistry', addresses.Registry);
  await setBalance(signer.address, ethers.parseEther('1'));

  assert.equal(await testnetRegistry.isMember(signer.address), false, 'Expected signer to be not a member');

  const dummySignature = '0x' + crypto.randomBytes(64).toString('hex');
  const joinTx = await testnetRegistry
    .connect(signer)
    .join(signer.address, dummySignature, { value: ethers.parseEther('0.002') });
  await joinTx.wait();

  assert(await testnetRegistry.isMember(signer.address), 'Signer is not a member');
  console.log(`Successfully joined ${signer.address}`);
};

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
