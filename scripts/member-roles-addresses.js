const { ethers } = require('hardhat');
const fs = require('node:fs').promises;
const path = require('node:path');
const { addresses, MemberRoles } = require('@nexusmutual/deployments');

/**
 * Generate filename for member addresses (no date, single file per role combination)
 * @param {Array} roleIds - Array of role IDs
 */
function generateFilename(roleIds) {
  const roleString = roleIds.length === 4 && roleIds.every((id, i) => id === i) ? 'all' : roleIds.join('-');
  return `member-roles-addresses-role-${roleString}.json`;
}

/**
 * Find the member roles addresses file for given roles
 */
async function findMemberRolesFile(roleIds) {
  const filename = generateFilename(roleIds);
  const filePath = path.join(__dirname, filename);

  try {
    await fs.access(filePath);
    console.log(`Found existing member roles file: ${filename}`);
    return filePath;
  } catch (error) {
    console.log(`No existing member roles file found: ${filename}`);
    return null;
  }
}

/**
 * Load existing member addresses data
 */
async function loadExistingData(roleIds) {
  const filePath = await findMemberRolesFile(roleIds);
  if (!filePath) {
    return null;
  }

  try {
    const fileContent = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(fileContent);
    console.log(`Loaded existing data: ${data.totalAddresses} addresses from ${data.extractedAt}`);
    return data;
  } catch (error) {
    console.log(`Failed to load existing data: ${error.message}`);
    return null;
  }
}

/**
 * Get new member addresses for a specific role ID, working backwards from the latest
 * @param {Object} memberRolesContract - MemberRoles contract instance
 * @param {number} roleId - Role ID to fetch
 * @param {Set} existingAddresses - Set of existing addresses for fast lookup
 * @param {number} lastKnownCount - Last known member count for this role
 */
async function getNewMemberAddressesForRole(memberRolesContract, roleId, existingAddresses, lastKnownCount = 0) {
  console.log(`Fetching new members for role ID ${roleId}...`);

  // Get current total member count
  const memberCountBigInt = await memberRolesContract.membersLength(roleId);
  const currentMemberCount = Number(memberCountBigInt);
  console.log(`Role ID ${roleId}: ${currentMemberCount} total members (was ${lastKnownCount})`);

  if (currentMemberCount <= lastKnownCount) {
    console.log(`  No new members found for role ${roleId}`);
    return [];
  }

  const newAddresses = [];
  const batchSize = 100;

  // Start from the newest members and work backwards
  for (let startIndex = currentMemberCount - 1; startIndex >= lastKnownCount; startIndex -= batchSize) {
    const endIndex = Math.max(startIndex - batchSize + 1, lastKnownCount);
    console.log(`  Fetching indices ${endIndex} to ${startIndex}...`);

    // Create promises for this batch
    const promises = [];
    for (let index = startIndex; index >= endIndex; index--) {
      promises.push(
        memberRolesContract.memberAtIndex(roleId, index).catch(error => {
          console.warn(`Failed to get member at index ${index}:`, error.message);
          return ['0x0000000000000000000000000000000000000000', false];
        }),
      );
    }

    // Execute batch of calls in parallel
    const results = await Promise.all(promises);

    // Process results (note: results are in reverse order due to countdown loop)
    for (let i = 0; i < results.length; i++) {
      const [address] = results[i];
      const currentIndex = startIndex - i;

      if (address === '0x0000000000000000000000000000000000000000') {
        continue;
      }

      const lowerAddress = address.toLowerCase();

      // If we're updating an existing dataset and we find an address we already have,
      // we can stop here since all previous addresses should already be in our dataset
      if (existingAddresses.size > 0 && existingAddresses.has(lowerAddress)) {
        console.log(`  Found existing address ${lowerAddress} at index ${currentIndex}, stopping backward search`);
        return newAddresses;
      }

      newAddresses.push(lowerAddress);
    }
  }

  console.log(`  Found ${newAddresses.length} new addresses for role ${roleId}`);
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
        existingAddressesFromFile, // Only use addresses from file for early termination
        lastKnownCount,
      );

      allNewAddresses.push(...newAddresses);

      // Note: Don't add to existingAddressesFromFile - that should only contain addresses from the file
    } catch (error) {
      console.error(`Failed to fetch members for role ID ${roleId}:`, error.message);
    }
  }

  // Combine existing and new addresses
  const allAddresses = existingData ? [...existingData.addresses, ...allNewAddresses] : allNewAddresses;

  const uniqueAddresses = [...new Set(allAddresses)];

  console.log(`Total new addresses found: ${allNewAddresses.length}`);
  console.log(`Total unique addresses: ${uniqueAddresses.length}`);

  return uniqueAddresses;
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
    // Parse command line arguments for role IDs
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

    // Initialize MemberRoles contract
    const memberRolesContract = await ethers.getContractAt([...MemberRoles], addresses.MemberRoles);
    console.log('MemberRoles contract initialized:', addresses.MemberRoles);

    // Load existing data
    const existingData = await loadExistingData(roleIds);

    // Get new member addresses (incremental if existing data, full if not)
    const memberAddresses = await getNewMemberAddresses(memberRolesContract, roleIds, existingData);

    if (memberAddresses.length === 0) {
      console.log('No member addresses found');
      return;
    }

    // Get current role counts for future incremental updates
    const currentRoleCounts = await getCurrentRoleCounts(memberRolesContract, roleIds);

    // Generate filename and save to JSON (overwrites existing file)
    const filename = generateFilename(roleIds);
    const outputPath = path.join(__dirname, filename);

    const existingAddressCount = existingData ? existingData.addresses.length : 0;
    const newAddressesCount = memberAddresses.length - existingAddressCount;
    const totalAddresses = existingAddressCount + newAddressesCount;

    const outputData = {
      extractedAt: new Date().toISOString(),
      roleIds,
      totalAddresses,
      roleCounts: currentRoleCounts,
      addresses: memberAddresses,
    };

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

// Run the script
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
