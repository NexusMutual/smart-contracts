const { ethers, network } = require('hardhat');

const MR = '0x055CC48f7968FD8640EF140610dd4038e1b03926';
const TK = '0xd7c49CEE7E9188cCa6AD8FF264C1DA2e69D4Cf3B';

const main = async () => {
  console.log(`Starting patch script on ${network.name} network`);

  const mrProxy = await ethers.getContractAt('OwnedUpgradeabilityProxy', MR);

  console.log('Reading owner');
  const owner = await mrProxy.proxyOwner();

  console.log('Getting a signer');
  const [signer] = await ethers.getSigners();

  console.log('Deploying new implementation contract');
  const mrImplementation = await ethers.deployContract('TestnetMemberRoles', [TK], signer);

  console.log('Upgrading proxy');
  const provider = new ethers.providers.JsonRpcProvider(network.config.url);
  const mrProxyAsOwner = new ethers.Contract(MR, mrProxy.interface, provider.getSigner(owner));
  await mrProxyAsOwner.upgradeTo(mrImplementation.address);
};
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
