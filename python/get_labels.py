import asyncio
import json
import aiohttp
import os

# Define global variables to store answers
MIRO_ORG_ID = 0
API_TOKEN = ''

def json_to_csv(json_data):
    # Convert JSON keys to a list if they are not already in that format
    if isinstance(json_data, dict):
        json_data = [json_data[key] for key in json_data]

    # Get the headers from the first element of the JSON data
    headers = list(json_data[0].keys())
    csv_data = ','.join(headers) + '\n'
    
    # Add the data
    for row in json_data:
        data = ','.join(json.dumps(row[header]) for header in headers)
        csv_data += data + '\n'
    
    return csv_data

# def json_to_csv(json_data):
#     if json_data:
#         csv = ''
#         # Get the headers
#         headers = list(json_data[0].keys())
#         csv += ','.join(headers) + '\n'
        
#         # Helper function to escape CSV special characters
#         def escape_csv(value):
#             if isinstance(value, (int, float)):
#                 value = str(value)
#             if isinstance(value, str):
#                 if '"' in value:
#                     value = value.replace('"', '""')
#                 # if ',' in value or '"' in value or '\n' in value:
#             value = f'"{value}"'
#             return value
        
#         # Add the data
#         for row in json_data:
#             data = ','.join(escape_csv(json_data[row][header]) for header in headers)
#             csv += data + '\n'
        
#         return csv

async def call_api(url, options):
    async def manage_errors(response):
        if not response.status == 200:
            parsed_response = await response.json()
            response_error = {
                'status': response.status,
                'status_text': response.reason,
                'request_url': str(response.url),
                'error_details': parsed_response
            }
            raise Exception(response_error)
        return response

    async with aiohttp.ClientSession() as session:
        async with session.request(url=url, **options) as response:
            try:
                response = await manage_errors(response)

                rate_limit_remaining = response.headers.get('X-RateLimit-Remaining')
                if response.status == 204:
                    body = await response.text()
                else:
                    body = await response.json()

                return {
                    'status': response.status,
                    'rate_limit_remaining': rate_limit_remaining,
                    'body': body
                }
            except Exception as e:
                return {
                    'status': response.status,
                    'status_text': response.reason,
                    'request_url': str(response.url),
                    'error_details': str(e)
                }

async def get_labels(session, org_id):
    global MIRO_ORG_ID
    global API_TOKEN

    req_headers = {
        'cache-control': 'no-cache, no-store',
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {API_TOKEN}'
    }

    req_get_options = {
        'method': 'GET',
        'headers': req_headers,
        'data': None
    }

    url = f'https://api.miro.com/v2/orgs/{org_id}/data-classification-settings'
    print(f'============== CLASSIFICATION LABELS - BEGIN ===================')
    list_labels = await call_api(url, req_get_options)
    print(json.dumps(list_labels, indent=4))
    print(f'============== CLASSIFICATION LABELS - END ===================')
    
    if list_labels['status'] == 200:
        get_classification_labels_array = []
        for item in list_labels['body']['labels']:
            label = {
                'label_id': item['id'],
                'label_name': item['name'],
                'is_default': item['default'],
                'description': item['description'] if 'description' in item else '',
                'order_number': item['orderNumber'],
                'type': item['type']
            }
            get_classification_labels_array.append(label)
        
        directory = 'board_classification_labels'
        if not os.path.exists(directory):
            os.makedirs(directory)

        with open('board_classification_labels/classification_labels.json', 'w') as file:
            file.write(str(get_classification_labels_array))

        content = json_to_csv(get_classification_labels_array)
        with open('board_classification_labels/classification_labels.csv', 'w') as file:
            file.write(str(content))
        
        print(f'# Next steps:\n# 1. Review the classification labels from the list above (or open the "classification_labels.csv" file within the folder "board_classification_labels" in the directory where this script lives)\n# 2. Identify the label you want to use to classify the unclassified boards (you will be asked for the ID of the desired label on step 3)\n# 3. Run: python3 get_labels.py')
        print('===========================================')
        return True

    else:
        print('====== see errors array below ======')
        result = {
            'organization_id': org_id,
            'response_error': json.dumps(list_labels),
            'responde_status': list_labels['status']
        }
        print(json.dumps(result, indent=4))
        return False

async def init():
    async with aiohttp.ClientSession() as session:
        await get_labels(session, MIRO_ORG_ID)
    return True

def ask_number_question(question):
    while True:
        answer = input(question).strip()
        if answer.isdigit():
            return int(answer)
        else:
            print("Invalid answer. Please enter a valid number.")

def ask_any_input_question(question):
    return input(question).strip()

def ask_questions():
    global MIRO_ORG_ID
    global API_TOKEN

    MIRO_ORG_ID = ask_number_question('Enter your Miro Organization ID: ')
    API_TOKEN = ask_any_input_question('Enter your Miro REST API Token: ')

def after_questions_answered():
    print("Thank you for answering the questions!")
    asyncio.run(init())

ask_questions()
after_questions_answered()
