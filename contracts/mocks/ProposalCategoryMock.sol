/* Copyright (C) 2017 GovBlocks.io
  This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.
  This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.
  You should have received a copy of the GNU General Public License
    along with this program.  If not, see http://www.gnu.org/licenses/ */
pragma solidity 0.5.7;

import "../ProposalCategory.sol";


contract ProposalCategoryMock is  ProposalCategory {
    function proposalCategoryInitiate() public {
        require(!constructorCheck);
        constructorCheck = true;
        _addInitialCategories("Uncategorized", "", "MR", 60, 15, 1, 0); //0
        _addInitialCategories("Add new member role", "QmQFnBep7AyMYU3LJDuHSpTYatnw65XjHzzirrghtZoR8U", 
        "MR", 60, 15, 1, 0);
        _addInitialCategories("Update member role", "QmXMzSViLBJ22P9oj51Zz7isKTRnXWPHZcQ5hzGvvWD3UV", 
        "MR", 60, 15, 1, 0);
        _addInitialCategories("Add new category", "QmUq9Rb6rWFHZXjVtyzh7AWGDeyVFtDHKiP5fJpgnuinQ7", "PC", 
        60, 15, 1, 0);
        _addInitialCategories("Edit category", "QmQmvfBiCLfe5jPdq69iRBRRdnSHSroJQ4SG8DhtkXcLfQ",  //4
        "PC", 60, 15, 1, 0);
        _addInitialCategories(
            "Upgrade a contract Implementation",
            "Qme4hGas6RuDYk9LKE2XkK9E46LNeCBUzY12DdT5uQstvh",
            "MS",
            50,
            15,
            2,
            80
        );
        
        //  --------------------------------------------------------------------------------------------- //
        _addInitialCategories("Implement Emergency Pause", "QmZSaEsvTCpy357ZSrPYKqby1iaksBwPdKCGWzW1HpgSpe",
        "MS", 0, 15, 1, 0);
        _addInitialCategories("Extend or Switch Off Emergency Pause", "Qmao6dD8amq4kxsAheWn5gQX22ABucFFGRvnRuY1VqtEKy",
        "MS", 50, 15, 2, 0);
        _addInitialCategories("Burn Claims Assessor Bond", "QmezNJUF2BM5Nv9EMnsEKUmuqjvdySzvQFvhEdvFJbau3k", //8
        "TF", 80, 15, 1, 0);
        _addInitialCategories("Pause Claim Assessor Voting for 3 days", 
        "QmRBXh9NGoGV7U7tTurKPhL4bzvDc9n23QZYidELpBPVdg", "CD", 60, 15, 1, 0);
        _addInitialCategories("Changes to Capital Model", "", "EX", 50, 15, 2, 60);
        _addInitialCategories("Changes to Pricing Model", "", "EX", 50, 15, 2, 60);
        _addInitialCategories("Withdraw funds to Pay for Support Services", 
        "QmZQhJunZesYuCJkdGwejSATTR8eynUgV8372cHvnAPMaM", "P1", 50, 15, 2, 80);
        // _addInitialCategories("Change to Authorities", "", "EX", 80, 15, 2); //no func yet
        _addInitialCategories("Add Investment Asset", "Qmd66GdYtn1BYmZTB1op1Fbfkq6uywMpow5LRmG2Twbzjb", //13
        "PD", 50, 15, 2, 60);
        _addInitialCategories("Edit Investment Asset min and max holding percentages", 
        "QmXwyffmk7rYGHE7p4g3oroJkmyEYAn6EffhZu2MCNcJGA",
        "PD", 50, 15, 2, 60);
        _addInitialCategories("Update Investment Asset Status", "QmZkxcC82WFRvnBahLT3eQ95ZSGMxuAyCYqxvR3tSyhFmB",
        "PD", 50, 15, 2, 60);
        _addInitialCategories("Change AB Member", "QmUBjPDdSiG3pRMqkVzZA2WaqiksT7ixNd3gPQwngGmF9x", 
            "MR", 50, 15, 2, 0); 
        _addInitialCategories("Add Currency Asset", "QmYtpNuTdProressqZwEmN7cFtyyJvhFBrqr6xnxQGWrPm", //17
            "PD", 50, 15, 2, 0);
        _addInitialCategories("Any other Item", "", "EX", 50, 15, 2, 80);
        _addInitialCategories("Special Resolution", "", "EX", 75, 0, 2, 0);
        _addInitialCategories("Update Token Parameters", "QmbfJTXyLTDsq41U4dukHbagcXef8bRfyMdMqcqLd9aKNM", 
            "TD", 50, 15, 2, 60);
        _addInitialCategories("Update Risk Assessment Parameters", "QmUHvBShLpDwPWAsWcZvbUJfVGyXYscybi5ASmF6ectxSo",
        //21
            "TD", 50, 15, 2, 60);
        _addInitialCategories("Update Governance Parameters", "QmdFDVEaZnJxXncFczTW6EvrcgR3jBfuPWftR7PfkPfqqT", 
            "GV", 50, 15, 2, 60);
        _addInitialCategories("Update Quotation Parameters", "QmTtSbBp2Cxaz8HzB4TingUozr9AW91siCfMjjyzf8qqAb", 
            "QD", 50, 15, 2, 60);
        _addInitialCategories("Update Claims Assessment Parameters", "QmPo6HPydwXEeoVdwBpwGeZasFnmFwZoTsQ93Bg5pFtQg6", 
            "CD", 50, 15, 2, 60);
        _addInitialCategories("Update Investment Module Parameters", "QmYSUJBJD9hUevydfdF34rGFG7bBQhMrxh2ga9XfeAkdEM", 
        //25
            "PD", 50, 15, 2, 60);
        _addInitialCategories("Update Capital Model Parameters", "QmaQH6AdvBdgrW4xdzcMHa7gNyYSGa2fz7gBuuic2hLkZQ", 
            "PD", 50, 15, 2, 60);
        _addInitialCategories("Update Address Parameters", "QmPfXySkeDFbdMvZyD35y1hiB4g6ZXLSEHfS7JjS6e1VKL", 
            "MS", 50, 15, 2, 60);
        _addInitialCategories("Update Owner Parameters", "QmTEmDA1ECmGPfh5x3co1GmjXQCp3zisUP6rnLQjWmW8nu", //28
            "MS", 50, 15, 3, 0);
        _addInitialCategories("Release new smart contract code", "QmSStfVwXF1TzDPCseVtMydgdF1xmzqhMtfpUg9Btx7tUp", 
        "MS", 50, 15, 2, 80);
        _addInitialCategories("Edit Currency Asset Address", "QmahwCzxmUX1QEjgczmA2NF4Nxtx839eRLCXbBFeFCm3cF",
        "PD", 50, 15, 3, 60);
        _addInitialCategories("Edit Currency Asset baseMin", "QmeFSwZ21d7XabxVc7eiNKbtfEXUuD8qQXkeHZ5To1vo4t",
        "PD", 50, 15, 2, 60);
        _addInitialCategories("Edit Investment Asset Address and decimal", 
        "QmRpztKqva2ud5xz9CQeb562bRQt2VEBPnjaWEPwN8q3vf",
        "PD", 50, 15, 3, 60);
    }

    function _addInitialCategories(
        string memory _name,
        string memory _actionHash,
        bytes2 _contractName,
        uint _majorityVotePerc, 
        uint _quorumPerc,
        uint _memberRoleToVote,
        uint _categoryABReq
    ) 
        internal 
    {
        uint[] memory allowedToCreateProposal = new uint[](1);
        uint[] memory stakeIncentive = new uint[](4);
        if (_memberRoleToVote == 3) {
            allowedToCreateProposal[0] = 3;
        } else {
            allowedToCreateProposal[0] = 2;
        }
        stakeIncentive[0] = 0;
        stakeIncentive[1] = 0;
        stakeIncentive[2] = _categoryABReq;
        if (_quorumPerc == 0) {//For special resolutions
            stakeIncentive[3] = 1;
        } else {
            stakeIncentive[3] = 0;
        }
        _addCategory(
                _name,
                _memberRoleToVote,
                _majorityVotePerc,
                _quorumPerc,
                allowedToCreateProposal,
                604800,
                _actionHash,
                address(0),
                _contractName,
                stakeIncentive
            );
    }

}