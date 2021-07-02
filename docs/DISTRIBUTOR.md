# Nexus Mutual Distributor Contract

- Tokenize Nexus Mutual cover as an NFT and resell it without requiring KYC to the end user.
- Earn 10% of the sold cover premiums by default, plus an optional fee on top.
 
## Code

The `Distributor` has a [standard implementation](https://github.com/NexusMutual/smart-contracts/tree/master/contracts/modules/distributor) `Distributor.sol`, deployed using the `DistributorFactory.sol`.

To integrate with Nexus Mutual and start selling cover, deploy an instance of the Distributor contract using the available `DistributorFactory`.
This contract becomes a Nexus Mutual member once its KYC has been approved. The membership fee is paid at contract creation as part of the call to the factory.

## Addresses

#### Mainnet

- DistributorFactory: `0x6752c6FbDDc24ac88f3749D8921E00c77Bffef8c`
- NXMaster: `0x01bfd82675dbcc7762c84019ca518e701c0cd07e`

#### Kovan

- DistributorFactory: `0x2920bad71C8C7cf53f857710345f4cA65F288Ad5`
- NXMaster: `0x2561D7f2436C121281388ecd54c702e55Aa24043`

## Deployment

The easiest way to deploy a new distributor is to use Etherscan, on either [mainnet](https://etherscan.io/address/0x6752c6FbDDc24ac88f3749D8921E00c77Bffef8c#writeContract) or [kovan](https://kovan.etherscan.io/address/0x2920bad71C8C7cf53f857710345f4cA65F288Ad5#writeContract).

Call `newDistributor` with the following parameters:
* **payableAmount** - 0.002 (exact ETH fee paid to register the Distributor as a NexusMutual member)

* **_feePercentage** = fee percentage of choice added on top of each cover sale as number 2 decimals points.
                 (eg. 725 for 7.25%, 1000 for 10%). Can be changed later with `setFeePercentage`

* **treasury** = Address to which all your profits from fees and sellNXM ETH returns will be automatically sent to. Can be changed later with `setTreasury`

* **tokenName** = your NFT token name of choice (eg. "Supercycle Gains Distributor")

* **tokenSymbol** = your NFT token symbol of choice (eg. "SGD")


Once the transaction is executed, go to the `eventLog` section for your transaction on either [mainnet](https://etherscan.io/tx/<yourtxhash>#eventlog) or [kovan](https://kovan.etherscan.io/tx/<yourtxhash>#eventlog). You will see the address of your new distributor contract in the `DistributorCreated` event as the `contractAddress` field. 

### KYC

KYC of the distributor contract must to be completed before any cover purchases can go through. 

#### Mainnet

Once you have the address of your distributor contract mainnet deployment, follow the steps [here](https://app.nexusmutual.io/home/distributor) to complete KYC.
This can take up to one business day to be processed.

#### Kovan

Use the `SelfKyc` contract to auto-approve KYC for your distributor address.

Go to [Etherscan](https://kovan.etherscan.io/address/0x74e0be134744ca896196796a58203d090bc791fe#writeContract) and call `approveKyc` with the following parameters: 
* **payableAmount** = 0
* **member** = *your distributor address*


## Contract functionalities

## User functions

Users are able to go through the buy -> claim -> redeem cycle.

## 1. Buy Cover Flow

For the cover pricing, the contract call currently requires a signed quote provided by
the NexusMutual quote api, which is then abi-encoded as part of the `data` parameter.

```
  function buyCover (
    address contractAddress,
    address coverAsset,
    uint sumAssured,
    uint16 coverPeriod,
    uint8 coverType,
    uint maxPriceWithFee,
    bytes calldata data
  )
    external
    payable
    nonReentrant
    returns (uint)
```

See this node.js [example code](https://github.com/NexusMutual/smart-contracts/blob/master/examples/example-distributor-buy-cover.js) for buying cover. Equivalent code will have to be implemented on the UI side. The example code uses the hardhat `run` command to run and TruffleContract; however it should be easily translatable to frontend code that does the equivalent with the library of your choice
(web3, ethers etc). 


## 2. Claim Flow: Protocol Cover & Custody Cover Types

Claims for Protocol and Custody cover types require 3 steps:

* submit proof of loss - must be done *BEFORE* calling `submitClaim`; if the proof is not available, the claim submission will be considered invalid
* `submitClaim` - submit the actual claim, once the proof of loss has been provided.
* `redeemClaim` - redeem the claim payout, once the claim has been approved.


#### 2.1. Submit proof of loss
Proof of the loss can be submitted by the user by following the steps on the following link:
https://app.nexusmutual.io/home/proof-of-loss/add-affected-addresses?coverId=<cover_id>&owner=<nft_owner_address>

Direct the user to the page above. Once they followed the steps and submitted the proof, allow the user to submit the claim, as explaine din the next step.


#### 2.2. Submit Claim

Submit a claim for a given cover. Only one claim can be active at once.

The `data` field is currently unused.

```
  function submitClaim(
    uint tokenId,
    bytes calldata data
  )
    external
    onlyTokenApprovedOrOwner(tokenId)
    returns (uint)
```

See this node.js [example code](https://github.com/NexusMutual/smart-contracts/blob/master/examples/example-distributor-submit-claim.js) for submitting a claim for a particular cover (cover id matches the NFT token id).

#### 2.3. Redeem Claim

The owner of the cover token reedems its claim payout. The claim must have been approved and paid out to the distributor contract for this to succeed. 

Once redeemed, the NFT token is burned.

To redeem a claim, both the `tokenId` of the cover and the `claimId` to be redeemed must be supplied. 

```
  function redeemClaim(
    uint256 tokenId,
    uint256 claimId
  )
    public
    onlyTokenApprovedOrOwner(tokenId)
    nonReentrant
```

## 3. Claim Flow: Yield Token Cover

#### 3.1. claimTokens
Claims the underlying tokens in exchange for depegged yield tokens at a price of 90% the price before the depeg incident.

```
  function claimTokens(
    uint tokenId,
    uint incidentId,
    uint coveredTokenAmount,
    address coverAsset
  )
    external
    onlyTokenApprovedOrOwner(tokenId)
    returns (uint claimId, uint payoutAmount, address payoutToken)
```

**Pre-condition**: The caller must first call `IERC20(coverAsset).approve(distributorAddress, coveredTokenAmount)`
on the Distributor address so the distributor can transfer the tokens over.

The function requires 4 arguments:

* **`tokenId`**: The cover NFT identifier used by the distributor contract.
* **`incidentId`**: The incident index that matches the properties of a yield token cover.

    Incidents are stored in `Incidents.sol` and can be retrieved by loading all `IncidentAdded` events chronologically. The first event will have index 0.
    `Incidents.sol` is deployed at the following addresses:
    - Mainnet: `0x8CEBa69a8e96a4ce71Aa65859DBdb180B489a719`
    - Kovan: `0x322f9a880189E3FFFf59b74644e13e5763C5AdB9`

    A UI should search through all submitted incidents and find the matching one using the following criteria:
    - The incident's `productId` must match the cover's `contractAddress`.
    - The incident's `date` must be after the cover's `purchaseDate`.
    - The incident's `date` must be before the cover's `validUntil`.

    When multiple incidents match the criteria, the UI should use the one with the highest `priceBefore` which is what a user would naturally choose.

    If an invalid `incidentId` is provided, the call will revert.

* **`coveredTokenAmount`**: The amount of depegged yield tokens that should be swapped back to their underlying asset.

    One thing to keep in mind here is that the user will be reimbursed at a price of 90% the price before the incident.

    Example: Given the price of 1 yDAI before the incident at 1 DAI and a yield token cover of 100 DAI, the reimbursement price is 0.9 DAI for each 1 yDAI.  If the user sends 111.(1) yDAI he gets the full amount of 100 DAI.  If the user instead sends 100 yDAI, only 90 DAI will be reimbursed.

* **`coverAsset`**: The address of the depegged yield token's ERC20 contract.


#### 3.2. getPayoutOutcome

Provides the current status of a claim.

```
  function getPayoutOutcome(uint claimId)
  public
  view
  returns (ICover.ClaimStatus status, uint amountPaid, address coverAsset)
```

The `amountPaid` is the amount in wei paid out if the `status` == `ACCEPTED`.

The `coverAsset` is the asset for the sum assured.

The Claim statuses are: `enum ClaimStatus { IN_PROGRESS, ACCEPTED, REJECTED }`

All claims start with `IN_PROGRESS` and end up being `ACCEPTED` or `REJECTED`.

## Owner admin functions

The contract accrues NXM over time as covers expire or are claimed.
The owner controls the NXM tokens stored in the contract.
The owner can withdraw, sell, or provide sell allowance for NXM.

All distributor fees determined by the `feePercentage` are collected in the `treasury` address.

The owner can also pause the use of `buyCover`, change the `feePercentage` and set the `treasury` address
for storing its fees at any time.


#### 1. approveNXM

```
  function approveNXM(address spender, uint256 amount) public onlyOwner
```

#### 2. withdrawNXM

```
function withdrawNXM(address recipient, uint256 amount) public onlyOwner
```

#### 3. sellNXM

Sell NXM stored in the distributor contract. The resulting ETH is sent to the `treasury` address.

```
function sellNXM(uint nxmIn, uint minEthOut) external onlyOwner
```

#### 4. switchMembership

Switch membership to another address of your choice. Currently requires that all covers tied
to the distributor are expired or claimed.

```
function switchMembership(address newAddress) external onlyOwner
```

#### 5. setFeePercentage

Change the added fee on top of cover purchases at any time.

```
function setFeePercentage(uint _feePercentage) external onlyOwner
```

#### 6. setBuysAllowed

Pause/unpause cover purchases at any time.

```
function setBuysAllowed(bool _buysAllowed) external onlyOwner
```

#### 7. setTreasury

Change where the distributor fees are sent to at any time.

```
function setTreasury(address payable _treasury) external onlyOwner
```

## API endpoints

To enable users to `buyCover` a signed price quote is currently necessary.


* #### GET v1/quote

  Get a signed price quote to use as part


  Example mainnet call:

  ```
  curl -X GET -H "Origin: https://yourcustomorigin.com" 'https://api.nexusmutual.io/v1/quote?coverAmount=1&currency=ETH&period=111&contractAddress=0xC57D000000000000000000000000000000000002'
  ```

  Example kovan call:

  ```
  curl -X GET 'https://api.staging.nexusmutual.io/v1/quote?coverAmount=1&currency=ETH&period=111&contractAddress=0xC57D000000000000000000000000000000000002'
  ```


  Example response:
  ```
  {
     "currency":"ETH",
     "period":"111",
     "amount":"1",
     "price":"7901437371663244",
     "priceInNXM":"206328266227258591",
     "expiresAt":1610868026,
     "generatedAt":1610867125800,
     "contract":"0xc57d000000000000000000000000000000000002",
     "v":27,
     "r":"0x19b567db10ddd7c64cd0bb4c012b8a77266515b54e488730b1a1aca79ea783d8",
     "s":"0x0a052b90cf91623f724d64dc441012cd703b8c0b49ac9b67795ed5f5f61ebbd6"
  }
  ```

  **Warning**: the `"amount"` field is in units *not in wei*. 1 means 1 ETH.

  Contact our team to get your `origin` whitelisted.

* #### GET v1/contracts/*contract-address*/capacity

  Returns the available capacity for a particular contract in both ETH and DAI.
  Based on available capacity you can decide whether a cover can be offered or not.
  (sum assured of that cover < available capacity).

  Example Kovan call:
  ```
  curl  -X GET 'https://api.staging.nexusmutual.io/v1/contracts/0xC57D000000000000000000000000000000000002/capacity'
  ```

  Example Mainnet call:
  ```
  curl  -X GET  -H "Origin: http://yourcustomorigin.com" 'https://api.nexusmutual.io/v1/contracts/0xC57D000000000000000000000000000000000002/capacity'
  ```

  Example response:

  ```
  {
     "capacityETH":"3652580281259279314200",
     "capacityDAI":"4330350165767307632900000",
     "netStakedNXM":"51152035000000000000000",
     "capacityLimit":"STAKED_CAPACITY"
  }
  ```

* #### GET coverables/contracts.json

  Provides you with a list of contracts that can be covered to display within your app.

  Example call:

  ```
   curl https://api.nexusmutual.io/coverables/contracts.json
  ```

  Example response:

  ```
  {
    "0xF5DCe57282A584D2746FaF1593d3121Fcac444dC":{
      "name":"Compound Sai",
      "type": "contract",
      "dateAdded":"2020-01-01",
      "deprecated":true
    },
    "0x8B3d70d628Ebd30D4A2ea82DB95bA2e906c71633":{
      "name":"bZx",
      "type": "contract",
      "dateAdded":"2020-01-01",
      "logo":"https://api.nexusmutual.io/coverables/images/bzx.png",
      "github":"https://github.com/bZxNetwork",
      "messari":""
    },
  }
  ```

  Important: If an entry has `"deprecated": true` skip it. no more covers can be bought on it.
