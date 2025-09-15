const { ethers } = require('hardhat');
const fs = require('node:fs').promises;
const path = require('node:path');
const { addresses, MemberRoles } = require('@nexusmutual/deployments');

/**
 * Script to get the latest member addresses for specified roles
 *
 * Defaults to fetching all roles and writes the output to member-roles-addresses-role-all.json
 * Can be overridden with --roles=0,1,2,3 to fetch only the specified roles
 * i.e. npx hardhat run ./scripts/member-roles-addresses.js --network mainnet --roles=2,3
 *
 * Only reads and appends new addresses to the existing file (if any)
 */

/**
 * Generate filename for member addresses (no date, single file per role combination)
 * @param {Array} roleIds - Array of role IDs
 */
function generateFilename(roleIds) {
  const roleString = roleIds.length === 4 && roleIds.every((id, i) => id === i) ? 'all' : roleIds.join('-');
  return `member-roles-addresses-role-${roleString}.json`;
}

/**
 * Load existing member addresses data for given roles
 */
async function loadExistingData(roleIds) {
  const filename = generateFilename(roleIds);
  const filePath = path.join(__dirname, filename);

  try {
    const fileContent = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(fileContent);
    console.log(`Loaded existing data: ${data.totalAddresses} addresses from ${data.extractedAt}`);
    return data;
  } catch (error) {
    console.log(`No existing member roles file found: ${filename}`);
    return null;
  }
}

/**
 * Get all new member addresses for the specified role IDs.
 * If an existing addresses file is found, only new (missing) addresses are added.
 * If no file exists, all addresses are fetched.
 */
async function getNewMemberAddressesForRole(memberRolesContract, roleId, existingAddresses, lastKnownCount = 0) {
  console.log(`Fetching new members for role ID ${roleId}...`);

  const memberCountBigInt = await memberRolesContract.membersLength(roleId);
  const currentMemberCount = Number(memberCountBigInt);
  console.log(`Role ID ${roleId}: ${currentMemberCount} total members (was ${lastKnownCount})`);

  if (currentMemberCount <= lastKnownCount) {
    console.log(`  No new members found for role ${roleId}`);
    return [];
  }

  const newAddresses = [];
  const batchSize = 100;

  // start from the newest members and work backwards
  for (let startIndex = currentMemberCount - 1; startIndex >= lastKnownCount; startIndex -= batchSize) {
    const endIndex = Math.max(startIndex - batchSize + 1, lastKnownCount);
    console.log(`  Fetching indices ${endIndex} to ${startIndex}...`);

    const promises = [];
    for (let index = startIndex; index >= endIndex; index--) {
      promises.push(
        memberRolesContract.memberAtIndex(roleId, index).catch(error => {
          console.warn(`Failed to get member at index ${index}:`, error.message);
          return ['0x0000000000000000000000000000000000000000', false];
        }),
      );
    }

    const results = await Promise.all(promises);

    // process results (NOTE: results are in reverse order due to reverse loop)
    for (let i = 0; i < results.length; i++) {
      const [address] = results[i];
      const currentIndex = startIndex - i;

      if (address === '0x0000000000000000000000000000000000000000') {
        continue;
      }

      const lowerAddress = address.toLowerCase();

      // stop if we find an existing address (all previous addresses should already be in our dataset)
      if (existingAddresses.size > 0 && existingAddresses.has(lowerAddress)) {
        console.log(`Found existing address ${lowerAddress} at index ${currentIndex}, stopping backward search`);
        return newAddresses;
      }

      newAddresses.push(lowerAddress);
    }
  }

  console.log(`Found ${newAddresses.length} new addresses for role ${roleId}`);
  return newAddresses;
}

/**
 * Get all new member addresses for the specified role IDs
 * @param {Object} memberRolesContract - MemberRoles contract instance
 * @param {Array} roleIds - Array of role IDs to fetch (0-3)
 * @param {Object} existingData - Existing data from previous run
 */
async function getNewMemberAddresses(memberRolesContract, roleIds, existingData) {
  console.log('Fetching new member addresses for role IDs:', roleIds);

  const existingAddressesFromFile = existingData ? new Set(existingData.addresses) : new Set();

  const existingCounts = existingData?.roleCounts || {};
  const allNewAddresses = [];

  for (const roleId of roleIds) {
    try {
      const lastKnownCount = existingCounts[roleId] || 0;
      const newAddresses = await getNewMemberAddressesForRole(
        memberRolesContract,
        roleId,
        existingAddressesFromFile,
        lastKnownCount,
      );
      allNewAddresses.push(...newAddresses);
    } catch (error) {
      console.error(`Failed to fetch members for role ID ${roleId}:`, error.message);
    }
  }

  console.log(`Total new addresses found: ${allNewAddresses.length}`);

  return existingData ? [...existingData.addresses, ...allNewAddresses] : allNewAddresses;
}

/**
 * Get current member counts for all roles
 * @param {Object} memberRolesContract - MemberRoles contract instance
 * @param {Array} roleIds - Array of role IDs
 */
async function getCurrentRoleCounts(memberRolesContract, roleIds) {
  const roleCounts = {};

  for (const roleId of roleIds) {
    try {
      const memberCountBigInt = await memberRolesContract.membersLength(roleId);
      roleCounts[roleId] = Number(memberCountBigInt);
    } catch (error) {
      console.error(`Failed to get count for role ID ${roleId}:`, error.message);
      roleCounts[roleId] = 0;
    }
  }

  return roleCounts;
}

/**
 * Main function to extract member addresses
 */
async function main() {
  try {
    // parse command line arguments for role IDs
    const args = process.argv.slice(2);
    let roleIds = [0, 1, 2, 3]; // default to all roles

    if (args.length > 0) {
      const roleArg = args.find(arg => arg.startsWith('--roles='));
      if (roleArg) {
        roleIds = roleArg
          .split('=')[1]
          .split(',')
          .map(id => parseInt(id.trim()));
      }
    }

    const network = await ethers.provider.getNetwork();
    console.log(`Connected to network: ${network.name} (chainId: ${network.chainId})`);

    const memberRolesContract = await ethers.getContractAt([...MemberRoles], addresses.MemberRoles);
    const existingData = await loadExistingData(roleIds);

    // get new member addresses (incremental if existing data, full if not)
    const memberAddresses = await getNewMemberAddresses(memberRolesContract, roleIds, existingData);

    if (memberAddresses.length === 0) {
      console.log('No member addresses found');
      return;
    }

    const filename = generateFilename(roleIds);
    const outputPath = path.join(__dirname, filename);

    const existingAddressCount = existingData ? existingData.addresses.length : 0;
    const newAddressesCount = memberAddresses.length - existingAddressCount;
    const totalAddresses = existingAddressCount + newAddressesCount;

    const outputData = {
      extractedAt: new Date().toISOString(),
      roleIds,
      totalAddresses,
      roleCounts: await getCurrentRoleCounts(memberRolesContract, roleIds),
      addresses: memberAddresses,
    };

    // save to file (overwrites existing file)
    await fs.writeFile(outputPath, JSON.stringify(outputData, null, 2));

    console.log(`\nMember roles addresses saved to: ${outputPath}`);
    console.log(`Existing addresses: ${existingAddressCount}`);
    console.log(`New addresses added: ${newAddressesCount}`);
    console.log(`Total addresses: ${totalAddresses}`);
    console.log(`Role IDs: ${roleIds.join(', ')}`);
  } catch (error) {
    console.error('Script failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main()
    .then(() => {
      console.log('\nScript completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('Unhandled error:', error);
      process.exit(1);
    });
}

module.exports = { getNewMemberAddresses, generateFilename };
