let IS_TEST = true;
let MIRO_ORG_ID = '';
let DESIRED_CLASSIFICATION_LABEL_ID = '';
let API_TOKEN = '';
let DOWNLOAD_FULL_REPORT_OF_EXISTING_BOARDS = false;
const readline = require('readline');
const fs = require('fs');

// Create readline interface
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Function to ask a question
function askQuestion(question, validator, callback) {
    rl.question(question, (answer) => {
        if (validator(answer)) {
            callback(answer);
        } else {
            console.log('Invalid input. Please try again.');
            askQuestion(question, validator, callback); // Re-ask the question
        }
    });
}

// Array of questions with corresponding validators
const questions = [
    {
      question: 'Is this a TEST Run? (y/n): ',
      validator: (answer) => answer.toLowerCase() === 'y' || answer.toLowerCase() === 'n'
    },
    {
        question: 'Enter the ID of the "Classification Label" to be used to classify the unclassified Boards: ',
      validator: (answer) => !isNaN(parseFloat(answer)) && isFinite(answer)
    },
    {
        question: 'Enter your Miro Organization ID: ',
        validator: (answer) => !isNaN(parseFloat(answer)) && isFinite(answer)
    },
    {
        question: 'Enter your Miro REST API Token: ',
        validator: (answer) => typeof answer === 'string'
    },
    {
        question: 'Should this script create a full report of existing boards? (y = slower / n = faster): ',
        validator: (answer) => answer.toLowerCase() === 'y' || answer.toLowerCase() === 'n'
    }
    // Add more questions with validators as needed
];

// Function to ask multiple questions recursively
async function askQuestions(index) {
    if (index >= questions.length) {
        // End of questions
        console.log('Thank you for answering the questions!');
        await runClassificationScript();
        rl.close();
        return;
    }
  
    const { question, validator } = questions[index];
    askQuestion(question, validator, (answer) => {
        if (question === 'Is this a TEST Run? (y/n): ') {
            IS_TEST = (answer === 'y' ? true : false);
        }
        else if (question === 'Enter the ID of the "Classification Label" to be used to classify the unclassified Boards: ') {
            DESIRED_CLASSIFICATION_LABEL_ID = answer;
        }
        else if (question === 'Enter your Miro Organization ID: ') {
            MIRO_ORG_ID = answer;
        }
        else if (question === 'Enter your Miro REST API Token: ') {
            API_TOKEN = answer;
        }
        else if (question === 'Should this script create a full report of existing boards? (y = slower / n = faster): ') {
            DOWNLOAD_FULL_REPORT_OF_EXISTING_BOARDS = (answer === 'y' ? true : false);
        }
        askQuestions(index + 1); // Ask the next question
    });
}

// Start asking questions
askQuestions(0);

// ========================= MAIN SCRIPT - BEGIN =============================
let getBoards_Requests_Batch_Number = 1000;
let getClassification_Requests_Batch_Number = 25;

let boardsToClassify = [];
let teamsSuccessfullyClassified = {};
let boardsSuccessfullyClassified = 0;

let teams = {};
let getUnclassifiedBoardsRemainingTeamBoards = {};
let getUnclassifiedBoardsProcessedItems = {};
let setUnclassifiedBoardsRemainingTeams = {};
let setUnclassifiedBoardsProcessedItems = {};
let globalProcessedUrls = {};
let boards = [];
let boardsObject = {};

let getUnclassifiedBoardsErrors = {};
let setBoardClassificationErrors = {};
let getBoardsExclusionList = {};
let getUnclassifiedBoardsExclusionList = {};
let setBoardClassificationExclusionList = {};
let getTeamsErrors = [];
let errorRetryCount = 0;
let getBoardsErrors = {};

async function runClassificationScript() {

    function jsonToCsv(jsonData) {
        let csv = '';
        // Get the headers
        let headers = Object.keys(jsonData[Object.keys(jsonData)[0]]);
        csv += headers.join(',') + '\n';
        // Add the data
        Object.keys(jsonData).forEach(function(row) {
            let data = headers.map(header => JSON.stringify(jsonData[row][header])).join(','); // Add JSON.stringify statement
            csv += data + '\n';
        });
        return csv;
    }

    function getStringsBetween(text, start, end) {
        // Create a regular expression dynamically using start and end strings
        var regex = new RegExp(`${start}(.*?)${end}`, 'g');
        var matches = [];
        var match;

        // Iterate over matches found by the regular expression
        while ((match = regex.exec(text)) !== null) {
            // Push the captured group into the matches array
            matches.push(match[1]);
        }
        return matches[0];
    }

    async function setBoardClassification(teamId, teamIndex, teamsLength, numberOfRequests, isErrorRetry) {
        if (!IS_TEST) {
            var results = [];
            var totalItems;
            var batchUrls;

            var reqHeaders = {
                'cache-control': 'no-cache, no-store',
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + API_TOKEN
            };

            var raw = JSON.stringify({
                'notClassifiedOnly': true,
                'labelId': DESIRED_CLASSIFICATION_LABEL_ID
            });

            var reqGetOptions = {
                method: 'PATCH',
                headers: reqHeaders,
                body: raw
            };

            const initialData = [];
            totalItems = Object.keys(teams);

            for(let i=0; i < totalItems.length; i++) {
                setUnclassifiedBoardsRemainingTeams[totalItems[i]] = { teamId: totalItems[i] }
            }

            let processedUrls = [];
            let batchSize;

            console.log(`# Setting Board Classification ONLY for "NOT YET CLASSIFIED" Boards within Team ${teamId} (Team ${teamIndex + 1} out of ${teamsLength}) - Already classified Boards will not be touched ...`);
            var apiUrl = `https://api.miro.com/v2/orgs/${MIRO_ORG_ID}/teams/${teamId}/data-classification`;

            // Calculate the number of items remaining to fetch
            const remainingItems = totalItems.length - (Object.keys(setUnclassifiedBoardsProcessedItems).length);

            if (Object.keys(setBoardClassificationErrors).length === 0) {
                // Calculate the number of calls to make in this batch
                batchSize = Math.min(numberOfRequests, Math.ceil(remainingItems / 1));
                batchUrls = [apiUrl];
            }
            else {
                if (setBoardClassificationErrors[Object.keys(setBoardClassificationErrors)[Object.keys(setBoardClassificationErrors).length - 1]].error == 429) { 
                    console.log(`Processed teams: ${Object.keys(setUnclassifiedBoardsProcessedItems).length} out of ${totalItems.length} in Team ${teamId} - Team ${teamIndex + 1} out of ${teamsLength} teams`);
                    await holdScriptExecution(39000); 
                }
                batchSize = Object.keys(setBoardClassificationErrors).length;
                batchUrls = Array.from({ length: batchSize }, (_, index) => `${Object.keys(setBoardClassificationErrors)[index]}`);
            }

            console.log(`.........API URLs in this the batch are:`);
            console.table(batchUrls);
            try {              
                const promisesWithUrls = batchUrls.map(url => {
                    const promise = fetch(url, reqGetOptions)
                        .catch(error => {
                            // Check if the error is a response error
                            if (error instanceof Response) {
                                // Capture the HTTP error code and throw it as an error
                                if (!setBoardClassificationErrors[url]) {
                                    setBoardClassificationErrors[url] = { team: teamId, url: url, error: error.status, errorMessage: error.statusText };
                                }
                                console.error({ team: teamId, url: url, errorMessage: errorMessage });
                                return Promise.reject(error);
                            } else {
                                // For other types of errors, handle them as usual
                                throw error;
                            }
                        });
                    return { promise, url };
                });

                // Fetch data for each URL in the batch                    
                const batchResponses = await Promise.allSettled(promisesWithUrls.map(({ promise }) => promise));
                for (let i = 0; i < batchResponses.length; i++) {
                    let { status, value, reason } = batchResponses[i];
                    if (status === 'fulfilled') {
                        if (!value.ok) {
                            if (value.status === 500) {
                                if (!setBoardClassificationExclusionList[value.url]) {
                                    setBoardClassificationExclusionList[value.url] = { team: teamId, url: value.url, error: value.status, errorMessage: value.statusText };
                                }
                                delete setUnclassifiedBoardsRemainingTeams[teamId];
                            }
                            else {
                                if (!setBoardClassificationErrors[value.url]) {
                                    setBoardClassificationErrors[value.url] = { team: teamId, url: value.url, error: value.status, errorMessage: value.statusText };
                                }
                            }
                        }
                        else {
                            setUnclassifiedBoardsProcessedItems[teamId] = {};
                            if (processedUrls.indexOf(value.url) === -1) {
                                let batchData = await value.json();
                                teamsSuccessfullyClassified[teamId] = { 
                                    team_id: teamId,
                                    team_name: teams[teamId].team_name,
                                    number_unclassified_boards_successfully_updated: batchData.numberUpdatedBoards 
                                };
                                if (DOWNLOAD_FULL_REPORT_OF_EXISTING_BOARDS) {
                                    teamsSuccessfullyClassified[teamId].number_boards_to_classify = teams[teamId].unclassified_boards.length;
                                }
                                boardsSuccessfullyClassified = boardsSuccessfullyClassified + batchData.numberUpdatedBoards;
                                processedUrls.push(value.url);
                                console.log(`### All "NOT YET CLASSIFIED" Boards in Team ${teamId} (Team ${teamIndex + 1} out of ${teamsLength}) were successfully updated (Number of Updated Boards: ${batchData.numberUpdatedBoards}) - Already classified Boards were not touched ####`);
                            }
                            if (!setUnclassifiedBoardsProcessedItems[teamId]) {
                                setUnclassifiedBoardsProcessedItems[teamId] = { team: teamId };
                            }
                            if (setBoardClassificationErrors[value.url]) {
                                delete setBoardClassificationErrors[value.url];
                            }
                            if (setBoardClassificationExclusionList[value.url]) {
                                delete setBoardClassificationExclusionList[value.url];
                            }
                            if (!globalProcessedUrls[value.url]) {
                                globalProcessedUrls[value.url] = { requestStatus: 'valid response received' };
                            }
                            delete setUnclassifiedBoardsRemainingTeams[teamId];
                        }
                    }
                    else {
                        let index = batchResponses.indexOf({ status, value, reason });
                        let failedUrl = promisesWithUrls[index].url;
                        if (!setBoardClassificationErrors[failedUrl]) {
                            setBoardClassificationErrors[failedUrl] = { team: teamId, url: failedUrl, error: status, errorMessage: value.statusText };
                        }
                        console.error(`Failed to fetch - API URL --> ${failedUrl}:`, reason);
                    }
                }
                console.log(`Processed teams: ${Object.keys(setUnclassifiedBoardsProcessedItems).length} out of ${totalItems.length} in Team ${teamId} - Team ${teamIndex + 1} out of ${teamsLength} teams`);
            } 
            catch (error) {
                console.error(error);
            }

            return { results };
        }
        else {
            console.log(`# Setting Board Classification ONLY for "NOT YET CLASSIFIED" Boards within Team ${teamId} (Team ${teamIndex + 1} out of ${teamsLength}) - Already classified Boards will not be touched ...`);
            teamsSuccessfullyClassified[teamId] = { team_id: teamId, team_name: teams[teamId].team_name, number_unclassified_boards_successfully_updated: '0 (Test Mode ON)' };
            if (DOWNLOAD_FULL_REPORT_OF_EXISTING_BOARDS) { teamsSuccessfullyClassified[teamId].number_boards_to_classify = teams[teamId].unclassified_boards.length }
            processedUrls = [];
            processedUrls.push(`https://api.miro.com/v2/orgs/${MIRO_ORG_ID}/teams/${teamId}/data-classification`);
            delete setUnclassifiedBoardsRemainingTeams[teamId];
            console.log(`....... TEST FLAG ON - Board classification action for Team ${teamId} was skipped - (Team ${teamIndex + 1} out of ${teamsLength}) ...`);
        }
    }

    async function getUnclassifiedBoards(teamId, teamIndex, teamsLength, numberOfRequests, isErrorRetry) {
        var results = [];
        var totalItems;
        var batchUrls;

        var reqHeaders = {
            'cache-control': 'no-cache, no-store',
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + API_TOKEN
        };

        var reqGetOptions = {
            method: 'GET',
            headers: reqHeaders,
            body: null
        };

        const initialData = [];
        totalItems = teams[teamId].all_boards;
        getUnclassifiedBoardsRemainingTeamBoards[teamId] = {};

        for(let i=0; i < totalItems.length; i++) {
            getUnclassifiedBoardsRemainingTeamBoards[teamId][totalItems[i]] = { id: totalItems[i], boardUrl: `https://miro.com/app/board/${totalItems[i]}/`, team: teamId }
        }

        getUnclassifiedBoardsProcessedItems[teamId] = {};
        let processedUrls = [];
        teams[teamId].unclassified_boards = [];
        teams[teamId].classified_boards = [];
        let batchSize;

        if (teams[teamId].all_boards.length === 0) {
            console.log(`.... No boards found in Team ${teamId}`);
        }

        while (Object.keys(getUnclassifiedBoardsRemainingTeamBoards[teamId]).length > 0) {
            var apiUrl = `https://api.miro.com/v2/orgs/${MIRO_ORG_ID}/teams/${teamId}/boards`;
            
            // Calculate the number of items remaining to fetch
            const remainingItems = totalItems.length - (Object.keys(getUnclassifiedBoardsProcessedItems[teamId]).length);

            if (Object.keys(getUnclassifiedBoardsErrors).length === 0) {
                // Calculate the number of calls to make in this batch
                batchSize = Math.min(numberOfRequests, Math.ceil(remainingItems / 1));
                batchUrls = Array.from({ length: batchSize }, (_, index) => `${apiUrl}/${Object.keys(getUnclassifiedBoardsRemainingTeamBoards[teamId])[index]}/data-classification`);
            }
            else {
                if (getUnclassifiedBoardsErrors[Object.keys(getUnclassifiedBoardsErrors)[Object.keys(getUnclassifiedBoardsErrors).length - 1]].error == 429) { 
                    console.log(`Processed Boards: ${Object.keys(getUnclassifiedBoardsProcessedItems[teamId]).length} out of ${totalItems.length} in Team ${teamId} - Team ${teamIndex + 1} out of ${teamsLength} teams`);
                    await holdScriptExecution(39000); 
                }
                batchSize = Object.keys(getUnclassifiedBoardsErrors).length;
                batchUrls = Array.from({ length: batchSize }, (_, index) => `${Object.keys(getUnclassifiedBoardsErrors)[index]}`);
                processedUrls.forEach(function(item) {
                    let urlIndex = batchUrls.indexOf(item);
                    if (urlIndex !== -1) {
                        batchUrls.splice(urlIndex, 1);
                    }
                });
                errorRetryCount = errorRetryCount + 1;
                if (errorRetryCount < 8) {
                    if (errorRetryCount === 7) { console.log('This is the third and last attempt to retry failed "getUnclassifiedBoards" calls...'); }
                }
                else {
                    console.log('Maximum amount of retry attempts for failed "getUnclassifiedBoards" calls reached (7). Please review the "getUnclassifiedBoardsErrors" object to find out what the problem is...');
                    return false;
                }
            }

            console.log(`.........API URLs in this the batch are:`);
            console.table(batchUrls);
            try {          
                const promisesWithUrls = batchUrls.map(url => {
                    const promise = fetch(url, reqGetOptions)
                        .catch(error => {
                            // Check if the error is a response error
                            if (error instanceof Response) {
                                // Capture the HTTP error code and throw it as an error
                                if (!getUnclassifiedBoardsErrors[url]) {
                                    getUnclassifiedBoardsErrors[url] = { team: teamId, url: url, error: error.status, errorMessage: error.statusText };
                                }
                                console.error({ team: teamId, url: url, errorMessage: errorMessage });
                                return Promise.reject(error);
                            } else {
                                // For other types of errors, handle them as usual
                                throw error;
                            }
                        });
                    return { promise, url };
                });

                // Fetch data for each URL in the batch
                const batchResponses = await Promise.allSettled(promisesWithUrls.map(({ promise }) => promise));
                for (let i = 0; i < batchResponses.length; i++) {
                    let { status, value, reason } = batchResponses[i];
                    if (status === 'fulfilled') {
                        if (!value.ok) {
                            if (value.status === 404) {
                                errorRetryCount = 0;
                                let batchData = await value.json();
                                let boardId = getStringsBetween(value.url, 'boards/', '/data-classification');
                                if (batchData.message === 'Board classification label was not found') {
                                    if (processedUrls.indexOf(value.url) === -1) {
                                        teams[teamId].unclassified_boards.push(boardId);
                                        boardsObject[boardId].board_url = `https://miro.com/app/board/${boardId}/`;
                                        boardsObject[boardId].classification_label = 'not_yet_classified';
                                        boardsObject[boardId].team_id = teamId;
                                        boardsObject[boardId].team_name = teams[teamId].team_name;
                                        boardsToClassify.push(boardId);
                                        delete getUnclassifiedBoardsRemainingTeamBoards[teamId][boardId];
                                        if (!getUnclassifiedBoardsProcessedItems[teamId][boardId]) {
                                            getUnclassifiedBoardsProcessedItems[teamId][boardId] = { id: boardId, classification_label: 'not_yet_classified', boardUrl: `https://miro.com/app/board/${boardId}/`, team: teamId };
                                        }
                                        else { debugger; console.log('######### WARNING: Repeated Board ID found - Please check! #######') }
                                    }
                                    if (getUnclassifiedBoardsErrors[value.url]) {
                                        delete getUnclassifiedBoardsErrors[value.url];
                                    }
                                    if (getUnclassifiedBoardsExclusionList[value.url]) {
                                        delete getUnclassifiedBoardsExclusionList[value.url];
                                    }
                                    if (!globalProcessedUrls[value.url]) {
                                        globalProcessedUrls[value.url] = { requestStatus: 'valid response received' };
                                    }
                                }
                            }
                            else if (value.status === 500) {
                                let boardId = getStringsBetween(value.url, 'boards/', '/data-classification');
                                if (!getUnclassifiedBoardsExclusionList[value.url]) {
                                    getUnclassifiedBoardsExclusionList[value.url] = { team: teamId, url: value.url, error: value.status, errorMessage: value.statusText, boardId: boardId, boardUrl: `https://miro.com/app/board/${boardId}/` };
                                }
                                delete getUnclassifiedBoardsRemainingTeamBoards[teamId][boardId];
                            }
                            else {
                                if (!getUnclassifiedBoardsErrors[value.url]) {
                                    getUnclassifiedBoardsErrors[value.url] = { team: teamId, url: value.url, error: value.status, errorMessage: value.statusText };
                                }
                            }
                        }
                        else {
                            errorRetryCount = 0;
                            if (processedUrls.indexOf(value.url) === -1) {
                                let boardId = getStringsBetween(value.url, 'boards/', '/data-classification');
                                let batchData = await value.json();
                                teams[teamId].classified_boards.push(boardId);
                                boardsObject[boardId].board_url = `https://miro.com/app/board/${boardId}/`;
                                boardsObject[boardId].classification_label = batchData.name;
                                boardsObject[boardId].team_id = teamId;
                                boardsObject[boardId].team_name = teams[teamId].team_name;
                                processedUrls.push(value.url);
                                delete getUnclassifiedBoardsRemainingTeamBoards[teamId][boardId];
                                if (!getUnclassifiedBoardsProcessedItems[teamId][boardId]) {
                                    getUnclassifiedBoardsProcessedItems[teamId][boardId] = { id: boardId, classification_label: batchData.name, boardUrl: `https://miro.com/app/board/${boardId}/`, team: teamId };
                                }
                                else { debugger; console.log('######### WARNING: Repeated Board ID found - Please check! #######') }
                                if (getUnclassifiedBoardsErrors[value.url]) {
                                    delete getUnclassifiedBoardsErrors[value.url];
                                }
                                if (getUnclassifiedBoardsExclusionList[value.url]) {
                                    delete getUnclassifiedBoardsExclusionList[value.url];
                                }
                                if (!globalProcessedUrls[value.url]) {
                                    globalProcessedUrls[value.url] = { requestStatus: 'valid response received' };
                                }
                            }
                        }
                    }
                    else {
                        let index = batchResponses.indexOf({ status, value, reason });
                        let failedUrl = promisesWithUrls[index].url;
                        if (!getUnclassifiedBoardsErrors[failedUrl]) {
                            getUnclassifiedBoardsErrors[failedUrl] = { team: teamId, url: failedUrl, error: status, errorMessage: value.statusText };
                        }
                        console.error(`Custom Message - API URL --> ${failedUrl}:`, reason);
                    }
                }
                console.log(`Processed Boards: ${Object.keys(getUnclassifiedBoardsProcessedItems[teamId]).length} out of ${totalItems.length} in Team ${teamId} - Team ${teamIndex + 1} out of ${teamsLength} teams`);
            } catch (error) {
                console.error(error);
            }
        }
        return { results };
    }

    async function getBoards(apiUrl, teamId, teamIndex, teamsLength, numberOfRequests, isErrorRetry) {
        const results = [];
        var processedUrls = [];
        var batchUrls;

        var reqHeaders = {
            'cache-control': 'no-cache, no-store',
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + API_TOKEN
        };

        var reqGetOptions = {
            method: 'GET',
            headers: reqHeaders,
            body: null
        };

        try {
            var response = await fetch(apiUrl, reqGetOptions);
            if (!response.ok) {
                throw new Error(`Failed to fetch data from ${apiUrl}: ${response.status} ${response.statusText}`);
            }
            else {
                processedUrls.push(apiUrl);
                if (!globalProcessedUrls[apiUrl]) {
                    globalProcessedUrls[apiUrl] = { requestStatus: 'valid response received' };
                }
                if (getBoardsErrors[apiUrl]) {
                    delete getBoardsErrors[apiUrl];
                }
            }
        } catch (error) {
            console.error(error);
            if (!getBoardsErrors[apiUrl]) {
                getBoardsErrors[apiUrl] = { team: teamId, url: apiUrl, error: error };
            }
            return await getBoards(apiUrl, teamId, teamIndex, teamsLength, numberOfRequests, isErrorRetry);
        }

        console.log(`Getting Boards of Team ${teamId} (Team No. ${teamIndex + 1} of ${teamsLength}) - API URL --> ${apiUrl}`);
        var initialData = await response.json();
        var totalItems = initialData.total;
        var processedItems = initialData.data.length;
        var idsToAdd = initialData.data.map(item => item.id);
        teams[teamId].all_boards.push(...idsToAdd);
        results.push(...initialData.data);

        while (processedItems < totalItems) {
            console.log(`ProcessedItems --> ${processedItems} out of ${totalItems} in Team ID teamId (Team ${teamIndex} out of ${teamsLength})`);
            console.log(`....Getting further Boards of Team ${teamId} asynchronously in batches of max ${numberOfRequests} per batch`);
            // Calculate the number of items remaining to fetch
            var remainingItems = totalItems - processedItems;
            // Calculate the number of calls to make in this batch (up to 4)
            var batchSize = Math.min(numberOfRequests, Math.ceil(remainingItems / 50));
            // Generate URLs for the next batch of calls
            if (Object.keys(getBoardsErrors).length > 0) {
                if (getBoardsErrors[Object.keys(getBoardsErrors)[Object.keys(getBoardsErrors).length - 1]].error == 429) { 
                    await holdScriptExecution(38000); 
                }
                batchUrls = Array.from({ length: batchSize }, (_, index) => `${Object.keys(getBoardsErrors)[index]}`);
                processedUrls.forEach(function(item) {
                    var urlIndex = batchUrls.indexOf(item);
                    if (urlIndex !== -1) {
                        batchUrls.splice(urlIndex, 1);
                    }
                });
                batchUrls.forEach(function(item) {
                    if (item === 'undefined') {
                        batchUrls.splice(item, 1);
                    }
                });
                errorRetryCount = errorRetryCount + 1;
                if (errorRetryCount < 8) {
                    if (errorRetryCount === 7) { console.log('This is the third and last attempt to retry failed "getBoards" calls...'); }
                }
                else {
                    console.log('Maximum amount of retry attempts for failed "getBoards" calls reached (7). Please review the "getBoards" object to find out what the problem is...');
                    return false;
                }
            }
            else {
                batchUrls = Array.from({ length: batchSize }, (_, index) => `${apiUrl}&offset=${processedItems + index * 50}`);
            }
            console.log(`.........API URLs for the batch are:`);
            console.table(batchUrls);

            try {
                // Create an array to store promises along with their corresponding URLs
                const promisesWithUrls = batchUrls.map(url => {
                    const promise = fetch(url, reqGetOptions).catch(error => {
                        if (!getBoardsErrors[url]) {
                            getBoardsErrors[url] = {team: teamId, url: url, error: error};
                        }
                        console.error({team: teamId, url: url, errorMessage: error});
                        return Promise.reject(error);
                    });
                    return { promise, url };
                });

                // Fetch data for each URL in the batch
                const batchResponses = await Promise.allSettled(promisesWithUrls.map(({ promise }) => promise));
                for (let i = 0; i < batchResponses.length; i++) {
                    let { status, value, reason } = batchResponses[i];
                    if (status === 'fulfilled') {
                        if (!value.ok) {
                            if (!getBoardsErrors[value.url]) {
                                getBoardsErrors[value.url] = { team: teamId, url: value.url, error: value.status };
                            }
                        }
                        else {
                            errorRetryCount = 0;
                            if (processedUrls.indexOf(value.url) === -1) {
                                let batchData = await value.json();
                                idsToAdd = batchData.data.map(item => item.id);
                                teams[teamId].all_boards.push(...idsToAdd);
                                processedItems += batchData.data.length;
                                processedUrls.push(value.url);
                                if (getBoardsErrors[value.url]) {
                                    delete getBoardsErrors[value.url];
                                }
                                if (getBoardsExclusionList[value.url]) {
                                    delete getBoardsExclusionList[value.url];
                                }
                                if (!globalProcessedUrls[value.url]) {
                                    globalProcessedUrls[value.url] = { requestStatus: 'valid response received' };
                                }
                            }
                        }
                    }
                    else {
                        let index = batchResponses.indexOf({ status, value, reason });
                        let failedUrl = promisesWithUrls[index].url;
                        if (!getBoardsErrors[failedUrl]) {
                            getBoardsErrors[failedUrl] = { team: teamId, url: failedUrl, error: status };
                        }
                        console.error(`Custom Message - API URL --> ${failedUrl}:`, reason);
                    }
                }
            } catch (error) {
                console.error(error);
            }
        }
        return { results };
    }

    var delay = ms => new Promise(res => setTimeout(res, ms));
    var holdScriptExecution = async (ms) => {
        console.log('**** Rate limit hit - Delaying execution for ' + (ms/1000) + ' seconds to replenish rate limit credits - Current time: ' + new Date() + '***');
        await delay(ms);
        console.log('**** Resumming script execution ***');
    };

    async function callAPI(url, options) {
        async function manageErrors(response) {
            if(!response.ok){
                var parsedResponse = await response.json();
                var responseError = {
                    status: response.status,
                    statusText: response.statusText,
                    requestUrl: response.url,
                    errorDetails: parsedResponse
                };
                throw(responseError);
            }
            return response;
        }

        var response = await fetch(url, options)
        .then(manageErrors)
        .then((res) => {
            if (res.ok) {
                var rateLimitRemaining = res.headers.get('X-RateLimit-Remaining');
                return res[res.status == 204 ? 'text' : 'json']().then((data) => ({ status: res.status, rate_limit_remaining: rateLimitRemaining, body: data }));
            }
        })
        .catch((error) => {
            console.error('Error:', error);
            return error;
        });
        return response;
    }

    async function iterateThroughBoards(teams, isErrorRetry, setClassification) {
        if (!setClassification && !isErrorRetry) {
            var summary = {};
            for(var i=0; i < Object.keys(teams).length; i++) {
                if (!summary[Object.keys(teams)[i]]) {
                    summary[Object.keys(teams)[i]] = {
                        teamId: Object.keys(teams)[i],
                        teamName: teams[Object.keys(teams)[i]].name,
                        numberOfBoards: teams[Object.keys(teams)[i]].all_boards.length
                    }
                }
                boards.push(...teams[Object.keys(teams)[i]].all_boards)
            }

            for(var i=0; i < boards.length; i++) {
                if (!boardsObject[boards[i]]) {
                    boardsObject[boards[i]] = {
                        board_id: boards[i],
                        classification_label: 'unknown'
                    };
                }
            }
        }

        for(var i=0; i < Object.keys(teams).length; i++) {
            var teamId = Object.keys(teams)[i];
            console.log(`Checking for unclassified Boards in Team ${teamId} (Team No. ${i + 1} of ${Object.keys(teams).length})`);
            if (!setClassification) {
                await getUnclassifiedBoards(teamId, i, Object.keys(teams).length, getClassification_Requests_Batch_Number, isErrorRetry);
            }
            else {
                await setBoardClassification(teamId, i, Object.keys(teams).length, getClassification_Requests_Batch_Number, isErrorRetry);
            }
        }

        if (!setClassification) {
            if (Object.keys(getUnclassifiedBoardsErrors).length > 0) {
                debugger;
                console.log('Errors found. Holding execution for 25 seconds to allow Rate Limit Credits to replenish');
                await holdScriptExecution(25000);
                errorRetryCount = errorRetryCount + 1;
                if (errorRetryCount < 4) {
                    if (errorRetryCount === 3) { console.log('This is the third and last attempt to retry failed "getBoards" calls...'); }
                    await iterateThroughBoards(getUnclassifiedBoardsErrors, true, setClassification);
                }
                else {
                    console.log('Maximum amount of retry attempts for failed "getUnclassifiedBoards" calls reached. Please review the errors array to find out what the problem is...');
                    return false;
                }
            }
            else {
                errorRetryCount = 0;
            }
            if (Object.keys(getUnclassifiedBoardsErrors).length === 0) {
                return iterateThroughBoards(teams, false, true);
            }
        }
        else {
            if (Object.keys(setBoardClassificationErrors).length > 0) {
                debugger;
                console.log('Errors found. Holding execution for 25 seconds to allow Rate Limit Credits to replenish');
                await holdScriptExecution(25000);
                errorRetryCount = errorRetryCount + 1;
                if (errorRetryCount < 4) {
                    if (errorRetryCount === 3) { console.log('This is the third and last attempt to retry failed "getBoards" calls...'); }
                    await iterateThroughBoards(setBoardClassificationErrors, true, setClassification);
                }
                else {
                    console.log('Maximum amount of retry attempts for failed "getUnclassifiedBoards" calls reached. Please review the errors array to find out what the problem is...');
                    return false;
                }
            }
            else {
                errorRetryCount = 0;
            }
        }
    }

    async function iterateThroughTeams(teamsArray, isErrorRetry) {
        if (DOWNLOAD_FULL_REPORT_OF_EXISTING_BOARDS) {
            for(var i=0; i < Object.keys(teamsArray).length; i++) {
                var apiUrl = `https://api.miro.com/v2/boards?team_id=${Object.keys(teamsArray)[i]}&limit=50`;
                await getBoards(apiUrl, Object.keys(teamsArray)[i], i, Object.keys(teamsArray).length, getBoards_Requests_Batch_Number, isErrorRetry);
            }

            if (Object.keys(getBoardsErrors).length > 0) {
                debugger;
                console.log('Errors found. Holding execution for 25 seconds to allow Rate Limit Credits to replenish');
                await holdScriptExecution(25000);
                errorRetryCount = errorRetryCount + 1;
                if (errorRetryCount < 4) {
                    if (errorRetryCount === 3) { console.log('This is the third and last attempt to retry failed "getBoards" calls...'); }
                    await iterateThroughTeams(getBoardsErrors, true);
                }
                else {
                    console.log('Maximum amount of retry attempts for failed "getBoards" calls reached. Please review the errors array to find out what the problem is...');
                    return false;
                }
            }
            else {
                errorRetryCount = 0;
            }
            if (Object.keys(getBoardsErrors).length === 0 && !isErrorRetry) {
                return await iterateThroughBoards(teamsArray, false);
            }
        }
        else {
            console.log(`.......Start Board Classification per Team...`);
            for(var i=0; i < Object.keys(teamsArray).length; i++) {
                await setBoardClassification(Object.keys(teamsArray)[i], i, Object.keys(teams).length, getClassification_Requests_Batch_Number, isErrorRetry);
            }
        }
        return true;
    }

    async function getTeams(orgId, cursor) {
        var reqHeaders = {
            'cache-control': 'no-cache, no-store',
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + API_TOKEN
        };

        var reqGetOptions = {
            method: 'GET',
            headers: reqHeaders,
            body: null
        };

        var url = `https://api.miro.com/v2/orgs/${orgId}/teams` + (cursor ? `?cursor=${cursor}` : '');
        console.log('Getting Miro Teams - API URL --> : ' + url);
        var listTeams = await callAPI(url, reqGetOptions);
        
        if (listTeams.status === 200) {
            for(var i=0; i < listTeams.body.data.length; i++) {
                var teamId = listTeams.body.data[i].id;
                teams[teamId] = listTeams.body.data[i];
                teams[teamId].team_id = teamId.toString();
                teams[teamId].team_name = teams[teamId].name.toString();
                teams[teamId].all_boards = [];
                delete teams[teamId].id;
                delete teams[teamId].name;
            }
            if (listTeams.body.cursor) {
                await getTeams(orgId, listTeams.body.cursor);
            }
            else {
                console.log('Getting Miro Teams COMPLETE - Begin iterating through Teams to get Boards...');
                await iterateThroughTeams(teams);

                console.log(`Script end time: ${new Date()}`);
                console.log('********** FINAL SUMMARY **********');
                console.log('For further details review the "classification_output_files" folder within your local directory where this script lives');
                var directory = 'classification_output_files';
                if (!fs.existsSync(directory)) {
                    fs.mkdirSync(directory);
                }
                var content;
                var filePath;
                if (DOWNLOAD_FULL_REPORT_OF_EXISTING_BOARDS) {
                    console.log(`====== Total Boards to classify --> ${boardsToClassify.length} ======`);
                    if (Object.keys(getUnclassifiedBoardsExclusionList).length > 0) {
                        console.log(`***IMPORTANT: there were ${Object.keys(getUnclassifiedBoardsExclusionList).length} Boards where the script could not retrieve the label data. It's possible that these ${Object.keys(getUnclassifiedBoardsExclusionList).length} Boards were also unclassified making a total of ${(boardsToClassify.length + Object.keys(getUnclassifiedBoardsExclusionList).length)} Boards to classify. These Boards are found in the file "board_classification_exclusion_list.json" ======`);
                        content = JSON.stringify(getUnclassifiedBoardsExclusionList, null, '2');
                        filePath = 'classification_output_files/board_classification_exclusion_list.json';
                        fs.writeFileSync(filePath, content);
                    }

                    if (Object.keys(getBoardsErrors).length > 0) {
                        content = JSON.stringify(getBoardsErrors, null, '2');
                        filePath = 'classification_output_files/board_errors.json';
                        fs.writeFileSync(filePath, content);
                    }

                    if (Object.keys(setBoardClassificationExclusionList).length > 0) {
                        content = JSON.stringify(setBoardClassificationExclusionList, null, 2);
                        filePath = 'classification_output_files/set_board_classification_exclusion_list.json';
                        fs.writeFileSync(filePath, content);
                    }

                    content = JSON.stringify(teams, null, 2);
                    filePath = 'classification_output_files/full_report_by_team_(before_update).json';
                    fs.writeFileSync(filePath, content);

                    content = JSON.stringify(boardsObject, null, 2);
                    filePath = 'classification_output_files/full_report_by_board_(before_update).json';
                    fs.writeFileSync(filePath, content);

                    content = JSON.stringify(boardsToClassify, null, 2);
                    filePath = 'classification_output_files/boards_to_classify_(before_update).json';
                    fs.writeFileSync(filePath, content);

                    content = jsonToCsv(boardsObject);
                    filePath = 'classification_output_files/full_report_by_board_(before_update).csv';
                    fs.writeFileSync(filePath, content);
                }

                console.log(`====== Total Boards successfully classified --> ${(IS_TEST ? '0 (TEST MODE IS ON)' : boardsSuccessfullyClassified)} ======`);
                console.log(`====== Total Teams where "NO YET CLASSIFIED" boards were successfully classified --> ${(IS_TEST ? ' 0 (TEST MODE IS ON))' : Object.keys(teamsSuccessfullyClassified).length)} ======`);
                if (Object.keys(getUnclassifiedBoardsExclusionList).length > 0) {
                    console.log(`====== There are URLs in the "getUnclassifiedBoardsExclusionList" object. Plese check --> `);
                    console.log(JSON.stringify(getUnclassifiedBoardsExclusionList, null, 2));
                }
                if (Object.keys(setBoardClassificationExclusionList).length > 0) {
                    console.log(`====== There are URLs in the "getUnclassifiedBoardsExclusionList" object. Plese check --> `);
                    console.log(JSON.stringify(setBoardClassificationExclusionList, null, 2));
                }

                content = jsonToCsv(teamsSuccessfullyClassified);
                filePath = 'classification_output_files/classification_result_(after_update).csv';
                fs.writeFileSync(filePath, content);

                var final_summary_csv = 'total_boards_to_classify,total_boards_successfully_classified,total_teams_where_unclassified_boards_were_successfully_classified,observation\n';
                var boardsToClassifySummaryString = boardsToClassify.length + (Object.keys(getUnclassifiedBoardsExclusionList).length > 0 ? '(Possibly' + (boardsToClassify.length + Object.keys(getUnclassifiedBoardsExclusionList).length) + ')' : '');
                final_summary_csv += `${boardsToClassifySummaryString},${(IS_TEST ? ' 0 (TEST MODE IS ON)' : boardsSuccessfullyClassified)},${(IS_TEST ? ' 0 (TEST MODE IS ON)' : Object.keys(teamsSuccessfullyClassified).length)},${(IS_TEST ? 'TEST MODE WAS ON - No changes were performed' : (Object.keys(getUnclassifiedBoardsExclusionList).length > 0 ? `There are/were ${Object.keys(getUnclassifiedBoardsExclusionList).length} Boards that the script could not retrieve the label data for. It's possible that these ${Object.keys(getUnclassifiedBoardsExclusionList).length} Boards were also unclassified making a total of ${(boardsToClassify.length + Object.keys(getUnclassifiedBoardsExclusionList).length)} Boards to classify. These Boards are found in the file "board_classification_exclusion_list.json"` : ''))}`;
                filePath = 'classification_output_files/final_summary.csv';
                fs.writeFileSync(filePath, final_summary_csv);

                console.log(`# Next step: Please go to "https://miro.com/app/settings/company/${MIRO_ORG_ID}/data-classification/" to confirm that there are no Boards left to classify (fastest option) or re-run this script with TEST MODE turned ON (slower option)`);
                console.log('********** END OF SCRIPT **********');
            }
        }
        else if (listTeams.rate_limit_remaining === 0) {
            await holdScriptExecution(31000);
            return await getTeams(orgId, cursor);
        }
        else {
            console.log('====== see errors array below ======');
            console.dir(listTeams);
            var result = {
                'team_id': teams[i],
                'response_error': JSON.stringify(listTeams),
                'full_error': listTeams
            };
            getTeamsErrors.push(result);
            console.log('====== ERROR: Could not get all Teams, please check the "getTeamsErrors" array to learn what the problem is ======');
            console.log(`Script end time: ${new Date()}`);
            console.log(`********** END OF SCRIPT  ${IS_TEST ? '(IN TEST MODE)': ''} **********`);
            return false;
        }
    }

    async function init() {
        console.log(`********** BEGIN OF SCRIPT ${IS_TEST ? '(IN TEST MODE)': ''} **********`);
        console.log(`Script start time: ${new Date()}`);
        await getTeams(MIRO_ORG_ID);
        return true;
    }

    init();
}
// ========================= MAIN SCRIPT - END =============================
