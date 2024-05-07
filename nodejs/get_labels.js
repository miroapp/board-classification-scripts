const fs = require('fs');
const readline = require('readline');

// Create readline interface
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

let MIRO_ORG_ID;
let API_TOKEN;

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
      question: 'Enter your Miro Organization ID: ',
      validator: (answer) => !isNaN(parseFloat(answer)) && isFinite(answer)
    },
    {
        question: 'Enter your Miro REST API Token: ',
        validator: (answer) => typeof answer === 'string'
    }
    // Add more questions with validators as needed
];

// Function to ask multiple questions recursively
async function askQuestions(index) {

    if (index >= questions.length) {
        // End of questions
        console.log('Thank you for answering the questions!');
        await init(MIRO_ORG_ID, API_TOKEN);
        rl.close();
        return;
    }
  
    const { question, validator } = questions[index];
    askQuestion(question, validator, (answer) => {
        if (question === 'Enter your Miro Organization ID: ') {
            MIRO_ORG_ID = answer.toString();
        }
        else if (question === 'Enter your Miro REST API Token: ') {
            API_TOKEN = answer.toString();;
        }
        askQuestions(index + 1); // Ask the next question
    });
}

// Start asking questions
askQuestions(0);

async function callAPI(url, options) {
    async function manageErrors(response) {
        if(!response.ok){
            const parsedResponse = await response.json();
            const responseError = {
                status: response.status,
                statusText: response.statusText,
                requestUrl: response.url,
                errorDetails: parsedResponse
            };
            throw(responseError);
        }
        return response;
    }

    const response = await fetch(url, options)
    .then(manageErrors)
    .then((res) => {
        if (res.ok) {
            const rateLimitRemaining = res.headers.get('X-RateLimit-Remaining');
            return res[res.status == 204 ? 'text' : 'json']().then((data) => ({ status: res.status, rate_limit_remaining: rateLimitRemaining, body: data }));
        }
    })
    .catch((error) => {
        console.error('Error:', error);
        return error;
    });
    return response;
}

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

async function init(orgId, token) {
    const apiUrl = `https://api.miro.com/v2/orgs/${orgId}/data-classification-settings`;
    const reqHeaders = {
        'cache-control': 'no-cache, no-store',
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
    };
    const reqGetOptions = {
        method: 'GET',
        headers: reqHeaders,
        body: null
    };
    try {
        const getClassificationLabels = await callAPI(apiUrl, reqGetOptions);
        console.log('============== CLASSIFICATION LABELS - BEGIN ===================');
        console.log(JSON.stringify(getClassificationLabels.body, null, 2));
        console.log('=============== CLASSIFICATION LABELS - END ===================');
        if (getClassificationLabels.status === 200) {
            const getClassificationLabelsArray = [];
            for(let i=0; i < getClassificationLabels.body.labels.length; i++) {
                var label = {
                    label_id: getClassificationLabels.body.labels[i].id,
                    label_name: getClassificationLabels.body.labels[i].name,
                    is_default: getClassificationLabels.body.labels[i].default,
                    description: getClassificationLabels.body.labels[i].description ? getClassificationLabels.body.labels[i].description : '',
                    order_number: getClassificationLabels.body.labels[i].orderNumber,
                    type: getClassificationLabels.body.labels[i].type
                };
                getClassificationLabelsArray.push(label);
            }
            const directory = 'board_classification_labels';
            if (!fs.existsSync(directory)) {
                fs.mkdirSync(directory);
            }
            let content;
            let filePath;
            content = jsonToCsv(getClassificationLabelsArray);
            filePath = 'board_classification_labels/classification_labels.csv';
            fs.writeFileSync(filePath, content);

            content = JSON.stringify(getClassificationLabelsArray, null, 2);
            filePath = 'board_classification_labels/classification_labels.json';
            fs.writeFileSync(filePath, content);
            
            console.log('# Next steps:\n# 1. Review the classification labels from the list above (or open the "classification_labels.csv" file within the folder "board_classification_labels" in the directory where this script lives)\n# 2. Identify the label you want to use to classify the unclassified boards (you will be asked for the ID of the desired label on step 3)\n# 3. Run: node classification.js');
            console.log('===========================================');
        }
    }
    catch(error) {
        console.log(error);
    }
}
