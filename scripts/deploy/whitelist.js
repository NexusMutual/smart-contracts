const { ethers, artifacts, run } = require('hardhat');

const MR = '0x055CC48f7968FD8640EF140610dd4038e1b03926';

const main = async () => {
  await run('compile');

  const mrProxy = await ethers.getContractAt('OwnedUpgradeabilityProxy', MR);
  const mrImplementationAddress = await mrProxy.implementation();

  const { deployedBytecode } = await artifacts.readArtifact('TestnetMemberRoles');
  await ethers.provider.send('tenderly_setCode', [mrImplementationAddress, deployedBytecode]);

  console.log('MR patched');
};

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
