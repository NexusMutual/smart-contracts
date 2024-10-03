const fs = require('node:fs/promises');

const { addresses } = require('@nexusmutual/deployments');

async function generateOutput() {
  // Read the JSON file
  const fileData = await fs.readFile('./v1-pooled-staking-stake-backup.json', 'utf-8');
  const pooledStakingStakeData = JSON.parse(fileData);

  console.log('pooledStakingStakeData.length: ', pooledStakingStakeData.length);
  return;

  // Prepare the output array
  const output = pooledStakingStakeData.map(data => ({
    to: addresses.LegacyPooledStaking,
    value: '0',
    data: null,
    contractMethod: {
      inputs: [
        {
          internalType: 'address',
          name: 'user',
          type: 'address',
        },
      ],
      name: 'withdrawForUser',
      payable: false,
    },
    contractInputsValues: {
      user: data.member,
    },
  }));

  console.log('output.length', output.length);

  // Save the output to a new JSON file
  await fs.writeFile('output.json', JSON.stringify(output, null, 2));
  console.log('Output has been written to output.json');
}

generateOutput().catch(console.error);
