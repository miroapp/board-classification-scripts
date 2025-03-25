# Miro Board Classification Script (Python)

This repository contains scripts to bulk update the classification label for "unclassified" boards in JavaScript (Node.js).

## Requirements

* [Python 3.x.x installed](https://www.python.org/downloads/)
* You must be a __Company Admin__ in your Miro account, or at least the user generating the token must be a __Company Admin__ in your Miro account (see steps 3 to 5)
* You must have the role __Content Admin__ assigned, or at least the user generating the token must have the role __Content Admin__ assigned (see step 4 below)

__Note__: If the person running the script is not a __Company Admin__ with the __Content Admin__ role in your organization's Miro account, please have a __Company Admin__ with the __Content Admin__ role in your Miro account follow the __steps 3 to 5__. Once the token has been created, the Miro __Company Admin__ with the __Content Admin__ role can provide the token to the user who will run the scripts to execute the changes.

## Step 1. Install Python

1.1. If you already have Python 3.x.x installed in your local machine, you may skip this step.

1.2. If you do not have Python 3.x.x installed, you'll need to install it. You can download the latest version of Python from the [official Python website](https://www.python.org/downloads/). (Feel free to use the command line to download and install Python 3.x.x if preferred).

## Step 2. Create directory for your script files

2.1. In your local machine create a folder in the desired location where you will store the files within this repository.

2.2. Download this repository as .zip and extract the files within into the directory created, or clone this repository into the desired location in your local machine.

## Step 3. Create a Developer Team in Miro

3.1. If you already have a Miro Developer Team, you may skip this step.

3.2. If you do not have yet a Miro Developer Team, please visit this [Miro Help](https://help.miro.com/hc/en-us/articles/4766759572114-Enterprise-Developer-teams) page and follow the instructions within the article to create an Enterprise Developer Team for your Miro Enterprise Account.

## Step 4. Make sure you have the "Content Admin" Role in your Miro Enterprise Account

4.1. To be able to check all Boards within your Miro Enterprise Account (including Boards you have not been invited to) you need to have the role __Content Admin__ assigned. To check this, proceed as explained in this [Miro Help](https://help.miro.com/hc/en-us/articles/360017571194-Roles-in-Miro#h_01HQ8889WQP2N8PCPRHTPTDNZR) article.

4.2. If you do not appear within the users assigned to the __Content Admin__ role, proceed to add yourself to the __Content Admin__ users as explained in the Help article mentioned in step 4.1.

## Step 5. Create a Miro App to get a REST API Token

5.1. To create a new application on your Miro Enterprise account using the Enterprise Developer team, navigate to __[Profile settings](https://help.miro.com/hc/en-us/articles/4408879513874-Profile-settings) > Your apps__, and click on __+ Create new app__.

<img src="https://miro-org.s3.eu-central-1.amazonaws.com/board_classification/Create_new_app.png" alt="Accept app terms screenshot" width="700" />

5.2. Insert the desired app name (e.g. __Board Classification Script__), select your Developer team for the application and click on __Create app__.

<img src="https://miro-org.s3.eu-central-1.amazonaws.com/board_classification/create_new_app.jpg" alt="Create app screenshot" width="502" />

5.3. On the app page, scroll down and select the following scopes of access to grant to your REST API token:<br><br>
  `boards:read`<br>
  `boards:write`<br>
  `organizations:read`<br>
  `organizations:teams:read`<br>

<img src="https://miro-org.s3.eu-central-1.amazonaws.com/board_classification/app_scopes.png" width="700" />

5.4. Click on __Install app and get OAuth token__

<img src="https://miro-org.s3.eu-central-1.amazonaws.com/board_classification/install_and_get_token_screenshot1.png" alt="Install and and get token screenshot" width="700" />

5.5. Select any team within your Enteprise account, the token will apply for the entire account based on the scopes set on step 5.3. and click on __Add__

<img src="https://miro-org.s3.eu-central-1.amazonaws.com/board_classification/select_team_screenshot.png" alt="Install and and get token screenshot" width="502" />

5.6. You will see the __REST API token__. Copy this token and store it in a secure place. You will need it when running the scripts.

<img src="https://miro-org.s3.eu-central-1.amazonaws.com/board_classification/get_access_token_screenshot.png" alt="Install and and get token screenshot" width="502" />

5.7. Find your __Miro Organization ID__ as you will need it when running the scripts. You will find your __Miro Organization ID__ in the URL of the page where you received the REST API token

<img src="https://miro-org.s3.eu-central-1.amazonaws.com/board_classification/get_miro_org_id_screenshot.png" alt="Install and and get token screenshot" width="903" />

## Step 6. Run script `get_labels.py` using the command line (CLI)

6.1. In your command line interface navigate to the directory where you have placed the script files (see step 2.2)

6.2. Run `pip3 install -r requirements.txt`

6.2. Run `python get_labels.py` (or `python3 get_labels.py`). This script will show you the existing classification labels in your Miro account. It will also create a CSV file called `classification_labels.csv` within the folder `board_classification_labels` in the directory where the script files lives in your local machine.

6.3. Enter the information asked by the script when prompted:
  * `Enter your Miro Organization ID`: enter your Miro Organization ID (see step 5.7) and hit "Enter"
  * `Enter your Miro REST API Token`: enter your Miro REST API Token (see step 5.6) and hit "Enter"

6.4. After the script `get_labels.py` has run, review the classification labels from the list shown in  the command line or open the `classification_labels.csv` file within the folder `board_classification_labels` located in the same directory where this script lives.

6.5. Identify the label you want to use to classify the unclassified boards (you will be asked for the ID of the desired label on the next steps)

## Step 7. Run script `classification.py` using the command line (CLI)

7.1. Run `python classification.py` (or `python3 classification.py`). The `classification.py` script allows you to run the script in __TEST MODE__ so you can test it without applying any changes. To run the script in __TEST MODE__ simply respond to this particular question when prompted by the script

7.2. Enter the information asked by the script when prompted:
  * `Is this a TEST Run? (y/n)`: Respond `y` if you want to run the script in __TEST MODE__ and hit "Enter". If you are ready to apply changes, enter `n` and the script will proceed to update the classification label for unclassified boards only. Already classified boards will not be updated.
  * `Enter the ID of the "Classification Label" to be used to classify the unclassified Boards`: enter the ID of the desired classification label that should be applied to classify the unclassified boards (see step 6.4) and hit "Enter"
  * `Enter your Miro Organization ID`: enter your Miro Organization ID (see step 5.7) and hit "Enter"
  * `Enter your Miro REST API Token`: Enter your Miro REST API Token (see step 5.6) and hit "Enter"
  * `Should this script create a full report of existing boards? (y = slower / n = faster)`: choose whether you want to have detailed reports of existing boards and their current classification labels before applying changes or not and hit "Enter"

7.3. After the script `classification.py` has run, review the summary presented in the command line and review the reports created within the folder `classification_output_files` in the directory where the script files live.

7.4. To confirm all unclassified Boards have been successfully classified, please go to `https://miro.com/app/settings/company/{YOUR_MIRO_ORG_ID}/data-classification/` (replace __{YOUR_MIRO_ORG_ID}__ in the URL with your Miro Organization ID from step 5.7) to confirm that there are no Boards left to classify (fastest option) or re-run this script with TEST MODE turned ON (slower option)

## Step 8. Revoke REST API token

The steps in this section are optional but recommended.

After you have confirmed all unclassified boards have been successfully classified, you may want to revoke the REST API token if you don't plan to use these functionalities in the future. 

8.1. To revoke the REST API token, go to __[Profile settings](https://help.miro.com/hc/en-us/articles/4408879513874-Profile-settings) > Your apps__ (in your Miro account)

8.2. Locate the app created on step 5.2 and click on it

8.3. Scroll to the bottom of the page and click on the button outlined in red that reads __Delete app__

<img src="https://miro-org.s3.eu-central-1.amazonaws.com/board_classification/delete_app_screenshot.png" alt="Delete app screenshot" width="903" />

## Troubleshooting

In case you get the error `NotOpenSSLWarning: urllib3 v2 only supports OpenSSL 1.1.1+` run the below commands:

`pip3 uninstall urllib3`<br>
`pip3 install urllib3==1.26.7`

In case you get the error on Mac `raise ClientConnectorCertificateError(req.connection_key, exc) from exc
aiohttp.client_exceptions.ClientConnectorCertificateError: Cannot connect to host api.miro.com:443 ssl:True [SSLCertVerificationError: (1, '[SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed: unable to get local issuer certificate (_ssl.c:1000)')]` run the below commands:

`python3 --version`

Note the version number and use it to run the command below (replace `{version_no}` with the first digit, dot and 2 decimals of the version number, e.g. 3.12)

`/Applications/Python\ {version_no}/Install\ Certificates.command`

## Support

If you have any questions or need assistance setting up this application, please reach out to your Miro Customer Success Manager, Onboarding Consultant, Technical Architect or dedicated Miro Solutions Engineer.
