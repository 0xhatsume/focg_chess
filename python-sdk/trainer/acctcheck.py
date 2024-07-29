from typing import NamedTuple, Optional

from account_configuration import AccountConfiguration

class AcctCheck:
    def __init__(self, 
        account_configuration: AccountConfiguration):
        self._account_configuration = account_configuration
    
    @property
    def account_configuration(self) -> AccountConfiguration:
        """The client's account configuration.

        :return: The client's account configuration.
        :rtype: AccountConfiguration
        """
        return self._account_configuration
    
    @property
    def username(self) -> str:
        """The account's username.

        :return: The account's username.
        :rtype: str
        """
        return self.account_configuration.username

def main():
    # Create a new account configuration
    account_configuration = AccountConfiguration(
        username="TestUser",
        password="password123")
    
    acctcheck = AcctCheck(account_configuration=account_configuration)
    print(acctcheck.username)

if __name__ == "__main__":
    main()