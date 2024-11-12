const { ethers, network } = require('hardhat');

const STV = '0xcafea5E8a7a54dd14Bb225b66C7a016dfd7F236b'; // StakingViewer
const MS = '0x01BFd82675DBCc7762C84019cA518e701C0cD07e'; // NXMaster

const main = async () => {
  console.log(`Starting deploy script on ${network.name} network`);

  console.log('Getting a signer');
  const [signer] = await ethers.getSigners();

  console.log('Deploying contracts');
  const assessmentViewerImplementation = await ethers.deployContract('AssessmentViewer', [MS], signer);
  const nexusViewerImplementation = await ethers.deployContract(
    'NexusViewer',
    [MS, STV, assessmentViewerImplementation.address],
    signer,
  );

  console.log('AssessmentViewer implementation address:', assessmentViewerImplementation.address);
  console.log('NexusViewer implementation address:', nexusViewerImplementation.address);
  console.log('NexusViewer ABI', nexusViewerImplementation.interface.format(ethers.utils.FormatTypes.json));
};
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
