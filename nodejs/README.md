# Miro Board Classification Script (Node.js)

This repository contains scripts to bulk update the classification label for "unclassified" boards in JavaScript (Node.js).

To complete the classification label for "unclassified" boards in bulk using this scripts, you need to perform 2 steps:

## Requirements

* [NodeJS 16.x or higher installed](https://nodejs.org/en/download/)

## Step 1. Install Node.js

1.1. If you already have Node.js installed in your local machine, you may skip this step.
1.2. If you do not have Node.js installed, proceed to download it [here](https://nodejs.org/en/download/) and proceed to install Node with the downloaded file. (Feel free to use your command line for the installation if preferred).

## Step 2. Create directory for your script files

2.1. In your local machine create a folder in the desired location where you will store the files within this repository.
2.2. Download this repository as .zip and extract the files within into the directory created, or clone this repository into the desired location in your local machine.

## Step 3. Create a Developer Team in Miro

3.1. If you already have a Miro Developer Team, you may skip this step.
3.2. If you do not have yet a Miro Developer Team, please visit this [Miro Help](https://help.miro.com/hc/en-us/articles/4766759572114-Enterprise-Developer-teams) page and follow the instructions within the article to create an Enterprise Developer Team for your Miro Enterprise Account.

## Step 4. Make sure you have the "Content Admin" Role in your Miro Enterprise Account

4.1. To be able to check all Boards within your Miro Enterprise Account (including Boards you have not been invited to) you need to have the role "Content Admin" assigned. To check this, proceed as explained in this [Miro Help](https://help.miro.com/hc/en-us/articles/360017571194-Roles-in-Miro#h_01HQ8889WQP2N8PCPRHTPTDNZR) article.
4.2. If you do not appear within the users assigned to the "Content Admin" role, proceed to add yourself to the "Content Admin" uses as explained in the Help article mentioned above.

## Step 5. Create a Miro App to get a REST API Token

5.1. To create a new application on your Miro Enterprise account using the Enterprise Developer team, navigate to [Profile settings](https://help.miro.com/hc/en-us/articles/4408879513874-Profile-settings) > Your apps, agree to the terms and conditions, and click on Create new app.

<img src="https://help.miro.com/hc/article_attachments/4775661957266" alt="Accept app terms screenshot" width="700" />

5.2. Insert the app name, select your Developer team for the application and click on __Create app__.

<img src="https://help.miro.com/hc/article_attachments/4775666891026" alt="Create app screenshot" width="502" />

5.3. On the app page, scroll down and select the following scopes of access to grant to your REST API token:<br><br>
  `boards:read`<br>
  `boards:write`<br>
  `organizations:read`<br>
  `organizations:teams:read`<br><br>

<img src="https://miro-org.s3.eu-central-1.amazonaws.com/board_classification/app_scopes.png" alt="Set app scopes screenshot" width="700" />

5.4. Click on __Install app and get OAuth token__

<img src="https://miro-org.s3.eu-central-1.amazonaws.com/board_classification/install_and_get_token_screenshot.png" alt="Install and and get token screenshot" width="700" />

5.5. Select any team within your Enteprise account, the token will apply for the entire account based on the scopes set on step 5.3. and click on __Add__

<img src="https://miro-org.s3.eu-central-1.amazonaws.com/board_classification/select_team_screenshot.png" alt="Install and and get token screenshot" width="502" />

5.6. You will see the REST API token. Copy this token and store it in a secure place. You will need it when running the scripts.

<img src="https://miro-org.s3.eu-central-1.amazonaws.com/board_classification/get_access_token_screenshot.png" alt="Install and and get token screenshot" width="502" />

## Step 6. Make sure you have the "Content Admin" Role in your Miro Enterprise Account

4.1. To be able to check all Boards within your Miro Enterprise Account (including Boards you have not

## Support

If you have any questions or need assistance setting up this application, please reach out to your Miro Customer Success Manager or dedicated Miro Solutions Engineer.
