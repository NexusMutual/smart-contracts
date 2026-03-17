# Token Contracts

## 1. Member Flow

```mermaid
graph TD
    %% Users
    Member(("Member"))

    %% Contracts
    NXMToken["NXMToken"]
    TokenController["TokenController"]
    NXMaster["NXMaster Registry"]

    %% Member interactions
    Member -->|"**(1)** transfer()"| NXMToken
    Member -->|"**(2a)** approve()"| NXMToken
    Member -->|"**(2b)** increaseAllowance()"| NXMToken
    Member -->|"**(2c)** decreaseAllowance()"| NXMToken
    Member -->|"**(3a)** withdrawNXM()"| TokenController
    TokenController -->|"**(3b)** transfer()"| NXMToken
    NXMToken -.->|"**(3c)** sends NXM"| Member

    %% Contract Registry interactions
    NXMToken -.->|"getLatestAddress"| NXMaster
    TokenController -.->|"getLatestAddress"| NXMaster
```

## 2. Operator Flow

```mermaid
graph TD
    %% Users
    Operator(("Operator"))

    %% Contracts
    TokenController["TokenController"]
    NXMToken["NXMToken"]
    NXMaster["NXMaster Registry"]

    %% Operator interactions
    Operator -->|"**(1a)** mint()"| TokenController
    TokenController -->|"**(1b)** mint()"| NXMToken
    Operator -->|"**(2a)** operatorTransfer()"| TokenController
    TokenController -->|"**(2b)** operatorTransfer()"| NXMToken
    NXMToken -.->|"**(2c)** sends NXM"| TokenController

    %% Contract Registry interactions
    TokenController -.->|"getLatestAddress"| NXMaster
    NXMToken -.->|"getLatestAddress"| NXMaster
```

## Actions

### Quick Summary:

1. Only members can hold, receive, or transfer NXM tokens
2. Members can manage token allowances for approved addresses
3. Operators can mint tokens and execute special transfers
4. Token transfers can be paused in emergencies

### 1. Member Actions

1. **Transfer Tokens**

   - **Member** calls `transfer()` on NXMToken with:
     - Recipient address
     - Amount to transfer

2. **Approve Spending**

   - **Member** calls `approve()` on NXMToken with:
     - Spender address
     - Amount to approve

3. **Check Balance**
   - **Member** calls `balanceOf()` on NXMToken to:
     - View current token balance

### 2. Operator Actions

1. **Mint Tokens**
   (1a) **Operator** calls `mint()` on TokenController with:

   - Recipient address
   - Amount to mint
     (1b) **TokenController** calls `mint()` on NXMToken

2. **Burn Tokens**
   (2a) **Operator** calls `burn()` on TokenController with:

   - Token holder address
   - Amount to burn
     (2b) **TokenController** calls `burn()` on NXMToken

3. **Pause Token**
   - **Operator** calls `pauseToken()` on TokenController to:
     - Halt token transfers in emergencies

## Notes

- Token transfers can be paused in emergencies
- Minting has configurable limits
- All contracts fetch latest addresses from NXMaster Registry

## NXMMaster Registry Dependencies

All contracts fetch latest contract addresses from NXMaster:

- **TokenController:** MR (`MemberRoles`), NXM (`NXMToken`)
- **NXMToken:** TC (`TokenController`)
